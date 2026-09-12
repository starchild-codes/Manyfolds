import { loadEnv } from 'vite'
import { Pool } from 'pg'
import { createAiConfig } from '../server/ai/config.ts'
import { rankAllowedModels } from '../server/ai/models.ts'

const config = createAiConfig({ ...loadEnv('development', process.cwd(), ''), ...process.env })
const report = { databaseConfigured: Boolean(config.databaseUrl), providerConfigured: Boolean(config.apiKey), models: config.allowedModels, liveSearch: config.liveDataEnabled }
const pool = new Pool({ connectionString: config.databaseUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, query_timeout: 15000, max: 1 })
try {
  if (!config.databaseUrl) throw new Error('Database configuration is missing')
  const result = await pool.query(`select c.model_id,a.enabled,a.review_status,c.available,coalesce(h.healthy,true) healthy
    from ai_model_catalogue c left join ai_model_allowlist a using(model_id)
    left join ai_model_health h using(model_id) where c.model_id=any($1::text[])`, [config.allowedModels])
  report.catalogue = result.rows
  report.eligible = await rankAllowedModels(pool, config)
  report.ready = Boolean(config.apiKey && report.eligible.length)
  if (!report.ready) process.exitCode = 1
} catch (error) {
  report.ready = false
  report.error = error.code || 'READINESS_FAILED'
  report.message = String(error.message).replace(/postgres(?:ql)?:\/\/\S+/gi, '[database URL redacted]')
  process.exitCode = 1
} finally {
  await pool.end()
  console.log(JSON.stringify(report, null, 2))
}
