import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { attachDatabasePool, getDatabasePool, readDatabase } from './database.ts'
import { authenticateRoadmapRequest, AuthenticationError } from './ai/auth.ts'
import { createAiConfig } from './ai/config.ts'
const knowledgeMap = {
  Career: { table: 'careers', id: 'career_id', name: 'title', summary: "case when verification_status='verified' then description else null end", field: 'division_title', source: 'source_name', url: 'source_url', reviewed: 'last_reviewed', status: "verification_status in ('verified','official_taxonomy_title')" },
  Course: { table: 'courses', id: 'course_id', name: 'course_name', summary: 'description', field: 'field', source: 'source_basis', url: 'source_url', reviewed: 'last_verified_at', status: "verification_status='verified'" },
  College: { table: 'institutions', id: 'institution_id', name: 'institution_name', summary: 'institution_type', field: 'state', source: 'source_name', url: 'source_url', reviewed: 'last_reviewed', status: "verification_status='verified'" },
  Exam: { table: 'exams', id: 'exam_id', name: 'exam_name', summary: 'typical_purpose', field: 'category', source: 'conducting_body', url: 'official_url', reviewed: 'last_reviewed', status: "verification_status='verified'" },
  Scholarship: { table: 'scholarships', id: 'scholarship_id', name: 'scholarship_name', summary: 'application_window', field: 'category', source: 'provider', url: 'official_url', reviewed: 'last_reviewed', status: "verification_status in ('verified','verified_listing')" },
} as const
export function knowledgeApi(env:Record<string,string|undefined>): Plugin {
  const pool=getDatabasePool(env.DATABASE_URL||'')
  const mount = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use('/api/knowledge', async (req, res) => {
      const reply = (status: number, body: unknown) => {
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(body))
      }
      try {
        const url = new URL(req.url || '', 'http://localhost')
        const type = url.searchParams.get('type') || 'Career'
        if (!(type in knowledgeMap)) return reply(400, { error: 'Invalid type' })
        const record = knowledgeMap[type as keyof typeof knowledgeMap]
        const query = (url.searchParams.get('q') || '').trim().slice(0, 120)
        const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)
        const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '30', 10) || 30))
        const claimType = type === 'College' ? 'institution' : type.toLowerCase()
        const nameClaim = `cc.entity_type='${claimType}' and cc.entity_id=${record.id}
          and cc.field_name='name' and cc.claim_value=to_jsonb(${record.name})
          and cc.verification_status='verified' and (cc.expires_at is null or cc.expires_at>=(now() at time zone 'Asia/Kolkata')::date)`
        const claimSource = `(select cc.source_url from catalogue_claims cc where ${nameClaim} order by cc.checked_at desc limit 1)`
        const claimPublisher = `(select cc.publisher from catalogue_claims cc where ${nameClaim} order by cc.checked_at desc limit 1)`
        const claimReviewed = `(select cc.checked_at from catalogue_claims cc where ${nameClaim} order by cc.checked_at desc limit 1)`
        const windowClaim = `cc.entity_type='scholarship' and cc.entity_id=${record.id}
          and cc.field_name='application_window' and cc.claim_value=to_jsonb(application_window)
          and cc.verification_status='verified' and (cc.expires_at is null or cc.expires_at>=(now() at time zone 'Asia/Kolkata')::date)`
        const verified = `${record.status} and nullif(btrim(${record.name}), '') is not null
          and ${record.url} ~* '^https?://' and ${record.reviewed} is not null
          ${type === 'Career' ? '' : `and exists(select 1 from catalogue_claims cc where ${nameClaim})`}`
        const filter = `${verified}${query ? ` and ${record.name} ilike $1` : ''}`
        const searchValues = query ? [`%${query}%`] : []
        const count = await readDatabase(pool,`select count(*)::int total from ${record.table} where ${filter}`, searchValues)
        const rows = await readDatabase(pool,
          `select ${record.id} id, ${record.name} name,
                  ${type === 'Career' ? record.summary : type === 'Scholarship' ? `case when exists(select 1 from catalogue_claims cc where ${windowClaim}) then application_window else null end` : 'null'} summary,
                  ${type === 'Career' ? record.field : 'null'} field,
                  ${type === 'Career' ? record.source : claimPublisher} source_name,
                  ${type === 'Career' ? record.url : claimSource} source_url,
                  ${type === 'Career' ? record.reviewed : claimReviewed} last_reviewed,
                  ${record.table === 'careers' || record.table === 'scholarships' ? 'verification_status' : "'verified'"} verification_status,
                  coalesce((select jsonb_agg(jsonb_build_object('field',fact.field_name,'value',fact.claim_value,'sourceUrl',fact.source_url,'publisher',fact.publisher,'checkedAt',fact.checked_at,'cycle',fact.academic_cycle) order by fact.field_name) from catalogue_claims fact where fact.entity_type='${claimType}' and fact.entity_id=${record.id} and fact.field_name in('entry_qualification','duration','nsqf_level','sector','approval_year','application_window') and fact.verification_status='verified' and (fact.expires_at is null or fact.expires_at>=(now() at time zone 'Asia/Kolkata')::date)),'[]') facts
           from ${record.table} where ${filter}
           order by ${record.name} asc limit $${searchValues.length + 1} offset $${searchValues.length + 2}`,
          [...searchValues, limit, (page - 1) * limit],
        )
        return reply(200, { type, page, limit, total: count.rows[0].total, records: rows.rows })
      } catch {
        return reply(500, { error: 'Verified record search failed' })
      }
    })
    attachDatabasePool(pool,server.httpServer)
  }
  return { name: 'manyfolds-knowledge-api', configureServer: mount, configurePreviewServer: mount }
}
export function counsellorApi(env:Record<string,string|undefined>): Plugin {
  const config = createAiConfig(env)
  const authPool = getDatabasePool(config.databaseUrl)
  const mount = (server: ViteDevServer | PreviewServer) => {
      server.middlewares.use('/api/counsellor-records', async (req, res) => {
        const reply = (status: number, body: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)) }
        try {
          const auth = await authenticateRoadmapRequest(req, authPool, config)
          const url = new URL(req.url || '', 'http://localhost')
          const type = url.searchParams.get('type') || ''
          if (!['student', 'course', 'college', 'scholarship'].includes(type)) return reply(400, { error: 'Invalid record type.' })
          if (req.method === 'GET') {
            const result = await readDatabase(authPool,'select external_key,payload,updated_at from counsellor_private_records where organisation_id=$1 and counsellor_external_id=$2 and record_type=$3 order by updated_at desc', [auth.organisationId, auth.userId, type])
            return reply(200, { records: result.rows })
          }
          const key = url.searchParams.get('key') || ''
          if (req.method === 'DELETE') {
            if (!key) return reply(400, { error: 'Record key is required.' })
            await authPool.query('delete from counsellor_private_records where organisation_id=$1 and counsellor_external_id=$2 and record_type=$3 and external_key=$4', [auth.organisationId, auth.userId, type, key])
            return reply(200, { ok: true })
          }
          if (req.method === 'PUT') {
            let raw = ''; for await (const chunk of req) raw += chunk
            const body = JSON.parse(raw || '{}') as { type?: string; key?: string; payload?: unknown }
            if (!body.key || body.type !== type) return reply(400, { error: 'A matching record type and key are required.' })
            const result = await authPool.query('insert into counsellor_private_records(organisation_id,counsellor_external_id,record_type,external_key,payload,updated_at) values($1,$2,$3,$4,$5,now()) on conflict(organisation_id,counsellor_external_id,record_type,external_key) do update set payload=excluded.payload,updated_at=now() returning external_key,payload,updated_at', [auth.organisationId, auth.userId, type, body.key, body.payload])
            return reply(200, { record: result.rows[0] })
          }
          return reply(405, { error: 'Method not allowed.' })
        } catch (error) {
          const status = error instanceof AuthenticationError ? error.statusCode : 500
          return reply(status, { error: error instanceof AuthenticationError ? error.message : 'Counsellor record request failed.' })
        }
      })
      attachDatabasePool(authPool,server.httpServer)
  }
  return { name: 'manyfolds-counsellor-api', configureServer: mount, configurePreviewServer: mount }
}
