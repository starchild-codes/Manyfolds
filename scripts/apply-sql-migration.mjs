import { readFile } from 'node:fs/promises'
import { loadEnv } from 'vite'
import { Client } from 'pg'
const path = process.argv[2]
if (!path) throw new Error('Pass a migration path')
const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const client = new Client({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:false}})
try {
  await client.connect()
  await client.query(await readFile(path,'utf8'))
  console.log(`Applied ${path}`)
} finally {
  await client.end().catch(() => undefined)
}
