import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { Client, Pool } from 'pg'
import { aiRoadmapApi } from './server/ai/plugin.ts'
import { authenticateRoadmapRequest, AuthenticationError } from './server/ai/auth.ts'
import { createAiConfig } from './server/ai/config.ts'

const localEnv = loadEnv('development', process.cwd(), '')
// Deployment hosts provide environment variables directly; local values only fill absent keys.
const env: Record<string, string | undefined> = { ...localEnv, ...process.env }
const map = { Career:['careers','career_id','title','description','division_title','source_name','source_url','last_reviewed','verification_status'], Course:['courses','course_id','course_name','description','field','source_basis','source_url','publish_recommendation','verification_status'], College:['institutions','institution_id','institution_name','institution_type','state','source_name','source_url','last_reviewed','verification_status'], Exam:['exams','exam_id','exam_name','typical_purpose','category','conducting_body','official_url','last_reviewed','verification_status'], Scholarship:['scholarships','scholarship_id','scholarship_name','eligibility_summary','category','provider','official_url','last_reviewed','verification_status'] } as const
function knowledgeApi(): Plugin { return { name:'manyfolds-knowledge-api', configureServer(server) { server.middlewares.use('/api/knowledge', async (req,res) => { try { const url = new URL(req.url || '', 'http://localhost'); const type = (url.searchParams.get('type') || 'Career') as keyof typeof map; const query = url.searchParams.get('q') || ''; const page=Math.max(1,Number(url.searchParams.get('page')||1)); const limit=Math.min(100,Math.max(10,Number(url.searchParams.get('limit')||30))); if (!map[type]) {res.statusCode=400;res.end(JSON.stringify({error:'Invalid type'}));return}; const [table,id,name,summary,field,source,urlField,review,status] = map[type]; const client = new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); await client.connect(); const filter = query ? `where ${name} ilike $1 or coalesce(${summary},'') ilike $1` : ''; const values=query?[`%${query}%`,limit,(page-1)*limit]:[limit,(page-1)*limit]; const offset=query?'$3':'$2'; const count = await client.query(`select count(*)::int total from ${table} ${filter}`, query?[`%${query}%`]:[]); const rows = await client.query(`select ${id} id, ${name} name, ${summary} summary, ${field} field, ${source} source_name, ${urlField} source_url, ${review} last_reviewed, ${status} verification_status from ${table} ${filter} order by ${name} asc limit $${query?2:1} offset ${offset}`,values); await client.end(); res.setHeader('Content-Type','application/json');res.end(JSON.stringify({type,page,limit,total:count.rows[0].total,records:rows.rows})) } catch(error) { res.statusCode=500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error instanceof Error?error.message:'Search failed'})) } }) } } }
function counsellorApi(): Plugin {
  const config = createAiConfig(env)
  const authPool = new Pool({ connectionString: config.databaseUrl, ssl: { rejectUnauthorized: false }, max: 1, idleTimeoutMillis: 10_000, allowExitOnIdle: true })
  return {
    name: 'manyfolds-counsellor-api',
    configureServer(server) {
      server.middlewares.use('/api/counsellor-records', async (req, res) => {
        const reply = (status: number, body: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)) }
        let client: Client | undefined
        try {
          const auth = await authenticateRoadmapRequest(req, authPool, config)
          const url = new URL(req.url || '', 'http://localhost')
          const type = url.searchParams.get('type') || ''
          if (!['student', 'course', 'college', 'scholarship'].includes(type)) return reply(400, { error: 'Invalid record type.' })
          client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
          await client.connect()
          if (req.method === 'GET') {
            const result = await client.query('select external_key,payload,updated_at from counsellor_private_records where counsellor_external_id=$1 and record_type=$2 order by updated_at desc', [auth.userId, type])
            return reply(200, { records: result.rows })
          }
          const key = url.searchParams.get('key') || ''
          if (req.method === 'DELETE') {
            if (!key) return reply(400, { error: 'Record key is required.' })
            await client.query('delete from counsellor_private_records where counsellor_external_id=$1 and record_type=$2 and external_key=$3', [auth.userId, type, key])
            return reply(200, { ok: true })
          }
          if (req.method === 'PUT') {
            let raw = ''; for await (const chunk of req) raw += chunk
            const body = JSON.parse(raw || '{}') as { type?: string; key?: string; payload?: unknown }
            if (!body.key || body.type !== type) return reply(400, { error: 'A matching record type and key are required.' })
            const result = await client.query('insert into counsellor_private_records(counsellor_external_id,record_type,external_key,payload,updated_at) values($1,$2,$3,$4,now()) on conflict(counsellor_external_id,record_type,external_key) do update set payload=excluded.payload,updated_at=now() returning external_key,payload,updated_at', [auth.userId, type, body.key, body.payload])
            return reply(200, { record: result.rows[0] })
          }
          return reply(405, { error: 'Method not allowed.' })
        } catch (error) {
          const status = error instanceof AuthenticationError ? error.statusCode : 500
          return reply(status, { error: error instanceof AuthenticationError ? error.message : 'Counsellor record request failed.' })
        } finally { if (client) await client.end().catch(() => undefined) }
      })
      server.httpServer?.once('close', () => { void authPool.end() })
    },
  }
}
export default defineConfig({ plugins:[react(),knowledgeApi(),counsellorApi(),aiRoadmapApi(env)], define:{__MANYFOLDS_SUPABASE_URL__:JSON.stringify(env.SUPABASE_URL||''),__MANYFOLDS_SUPABASE_ANON_KEY__:JSON.stringify(env.SUPABASE_ANON_KEY||env.PUBLISHABLE_KEY||'')} })
