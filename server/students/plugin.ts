import {AccessError,assertStudentAccess,rosterRoles,assertAreaAccess} from '../access.ts'
import type { IncomingMessage } from 'node:http'
import { attachDatabasePool, getDatabasePool, readDatabase, checkedDatabaseClient } from '../database.ts'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { authenticateRoadmapRequest, AuthenticationError } from '../ai/auth.ts'
import { createAiConfig } from '../ai/config.ts'

const json = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

class StudentRequestError extends Error {
  readonly statusCode: number
  constructor(message: string, statusCode: number) { super(message); this.statusCode = statusCode }
}

const readBody = async (req: IncomingMessage) => {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 64_000) throw new StudentRequestError('Student record is too large.', 413)
  }
  try {
    const body: unknown = JSON.parse(raw || '{}')
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body')
    return body as Record<string, unknown>
  }
  catch { throw new StudentRequestError('Student record must be valid JSON.', 400) }
}

const validStudent = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && record.id.length <= 120 &&
    typeof record.name === 'string' && record.name.trim().length > 0 && record.name.length <= 200 &&
    typeof record.grade === 'string' && record.grade.trim().length > 0 && record.grade.length <= 120 &&
    (record.counsellorId===undefined||record.counsellorId===''||(typeof record.counsellorId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.counsellorId)))
}

export function studentsApi(env: Record<string, string | undefined>,authenticate:typeof authenticateRoadmapRequest=authenticateRoadmapRequest): Plugin {
  const config = createAiConfig(env)
  const pool = getDatabasePool(config.databaseUrl)
  const mount = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use('/api/students', async (req, res) => {
      try {
        const auth = await authenticate(req, pool, config, 'students')
        const url = new URL(req.url || '/', 'http://localhost')
        const key = url.searchParams.get('key') || ''
        assertAreaAccess(auth,'students',url.pathname,req.method||'GET')
        if(key)await assertStudentAccess(pool,auth,key)
        const writeQuery=async(sql:string,values:unknown[])=>{const db=await checkedDatabaseClient(pool);try{await db.query('begin');await db.query('select id from organisations where id=$1 for update',[auth.organisationId]);const payload=values.find(value=>value&&typeof value==='object'&&!Array.isArray(value)) as Record<string,unknown>|undefined;if(payload?.counsellorId){const assigned=await db.query(`select 1 from organisation_memberships where organisation_id=$1 and user_id=$2 and active and role in('owner','admin','lead_counsellor','counsellor','guidance_teacher')`,[auth.organisationId,payload.counsellorId]);if(!assigned.rowCount)throw new StudentRequestError('Choose an active counsellor or school administrator.',400)}const result=await db.query(sql,values);await db.query('commit');return result}catch(error){await db.query('rollback');throw error}finally{db.release()}}
        if (req.method === 'GET' && !key) {
          const result = await readDatabase(pool,
            `select payload,version,archived_at from student_registry_records
             where organisation_id=$1 and public.school_can_access_student(organisation_id,external_key,$2) and ${url.searchParams.get('archived')==='only'?'archived_at is not null':'archived_at is null'} order by updated_at desc`, [auth.organisationId,auth.userId],
          )
          return json(res, 200, { records: result.rows.map(row => ({ ...(['teacher','data_entry'].includes(auth.role)?Object.fromEntries(['id','name','initials','grade','stage','pathway','followUp'].map(key=>[key,row.payload[key]])):row.payload), version: Number(row.version),archivedAt:row.archived_at })) })
        }
        if (!rosterRoles.includes(auth.role)) {
          throw new StudentRequestError('Your role can view, but cannot change student records.', 403)
        }
        if (req.method === 'POST' && !key) {
          const body = await readBody(req)
          if (!validStudent(body.record)) throw new StudentRequestError('A student ID, name and class are required.', 400)
          const { version: _version, ...record } = body.record
          if(auth.role==='data_entry')Object.assign(record,{stage:'Not started',counsellor:'Unassigned',counsellorId:'',followUp:'Not scheduled',pathway:'Not yet set',completion:0,priority:undefined})
          if(!['owner','admin','lead_counsellor','data_entry'].includes(auth.role))record.counsellorId=auth.userId
          const result = await writeQuery(
            `insert into student_registry_records
             (organisation_id,external_key,payload,created_by,updated_by)
             values($1,$2,$3,$4,$4)
             on conflict (organisation_id,external_key) do nothing returning version`,
            [auth.organisationId, record.id, record, auth.userId],
          )
          if (!result.rowCount) throw new StudentRequestError('This student record already exists. Reload the register.', 409)
          return json(res, 201, { record: { ...record, version: Number(result.rows[0].version) } })
        }
        if (!key || key.length > 120) throw new StudentRequestError('A valid student key is required.', 400)
        if (req.method === 'PUT') {
          const body = await readBody(req)
          if (!validStudent(body.record) || body.record.id !== key || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) {
            throw new StudentRequestError('A matching student record and version are required.', 400)
          }
          const { version: _version, ...record } = body.record
          if(!['owner','admin','lead_counsellor'].includes(auth.role)){
            const previous=(await pool.query('select payload from student_registry_records where organisation_id=$1 and external_key=$2',[auth.organisationId,key])).rows[0]?.payload
            if((record.counsellorId||'')!==(previous?.counsellorId||''))throw new StudentRequestError('Ask a school administrator or lead counsellor to change assignments.',403)
            if(auth.role==='data_entry')for(const field of new Set([...Object.keys(record),...Object.keys(previous||{})]))if(!['name','grade','initials'].includes(field)&&JSON.stringify(record[field])!==JSON.stringify(previous?.[field]))throw new StudentRequestError('Data entry access is limited to demographic and class fields.',403)
          }
          const result = await writeQuery(
            `update student_registry_records set payload=$4,version=version+1,
             updated_by=$5,updated_at=now()
             where organisation_id=$1 and external_key=$2 and version=$3 and archived_at is null
             returning version`,
            [auth.organisationId, key, body.expectedVersion, record, auth.userId],
          )
          if (!result.rowCount) throw new StudentRequestError('This student changed elsewhere. Reload before editing again.', 409)
          return json(res, 200, { record: { ...record, version: Number(result.rows[0].version) } })
        }
        if (req.method === 'PATCH') {
          if(!['owner','admin'].includes(auth.role))throw new StudentRequestError('Only a school owner or admin can restore a student.',403)
          const body=await readBody(req)
          if(!Number.isSafeInteger(body.expectedVersion))throw new StudentRequestError('A current version is required.',400)
          const result=await writeQuery('update student_registry_records set archived_at=null,archived_by=null,version=version+1,updated_by=$4,updated_at=now() where organisation_id=$1 and external_key=$2 and version=$3 and archived_at is not null returning payload,version',[auth.organisationId,key,body.expectedVersion,auth.userId])
          if(!result.rowCount)throw new StudentRequestError('This record changed elsewhere. Reload the archive.',409)
          return json(res,200,{record:{...result.rows[0].payload,version:Number(result.rows[0].version),archivedAt:null}})
        }
        if (req.method === 'DELETE') {
          if (!['owner', 'admin'].includes(auth.role)) throw new StudentRequestError('Only a school owner or admin can archive a student.', 403)
          const version = Number(url.searchParams.get('version'))
          if (!Number.isSafeInteger(version) || version < 1) throw new StudentRequestError('A student version is required.', 400)
          const result = await writeQuery(
            'update student_registry_records set archived_at=now(),archived_by=$4,updated_by=$4,updated_at=now(),version=version+1 where organisation_id=$1 and external_key=$2 and version=$3 and archived_at is null returning external_key',
            [auth.organisationId, key, version,auth.userId],
          )
          if (!result.rowCount) throw new StudentRequestError('This student changed elsewhere. Reload before deleting.', 409)
          return json(res, 200, { ok: true })
        }
        return json(res, 405, { error: 'Method not allowed.' })
      } catch (error) {
        if ((error as {code?:string}).code === '23503') return json(res, 409, {error:'This student has guidance history and cannot be deleted.'})
        const known = error instanceof AccessError || error instanceof AuthenticationError || error instanceof StudentRequestError
        return json(res, known ? error.statusCode : 500, { error: known ? error.message : 'Student record request failed.' })
      }
    })
    attachDatabasePool(pool,server.httpServer)
  }
  return { name: 'manyfolds-students-api', configureServer: mount, configurePreviewServer: mount }
}
