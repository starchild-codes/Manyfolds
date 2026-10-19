// Safe by default: inspect configuration without printing credentials or sending mail.
import { loadEnv } from 'vite'
import { readFile } from 'node:fs/promises'
import { resolveTxt } from 'node:dns/promises'
const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
const apply = process.argv.includes('--apply'), templatesOnly = process.argv.includes('--templates-only')
if (!env.SUPABASE_URL || !env.SUPABASE_ACCESS_TOKEN) throw new Error('SUPABASE_URL and SUPABASE_ACCESS_TOKEN are required locally.')
const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0]
if (ref !== 'apcorawxxgxyyemhptws') throw new Error('Unexpected Supabase project; use the Manyfolds project.')
const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`
const headers = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }
const getConfig = async () => {
 const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(20_000) })
 if (!response.ok) throw new Error(`Auth configuration could not be read (HTTP ${response.status}).`)
 return response.json()
}
const current = await getConfig()
const fields = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']
const missing = fields.filter(key => !env[key]?.trim())
const report = { project: 'Manyfolds', customSmtpConfigured: Boolean(current.smtp_host && current.smtp_user && current.smtp_pass), senderConfigured: Boolean(current.smtp_admin_email), confirmationRequired: current.mailer_autoconfirm === false, localMissingFields: missing, deliveryTested: false }
if (env.SMTP_FROM) {
 if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.SMTP_FROM)) throw new Error('SMTP_FROM must be a bare sender email address.')
 const domain = env.SMTP_FROM.split('@')[1]
 const records = await Promise.allSettled([resolveTxt(domain), resolveTxt(`_dmarc.${domain}`)])
 report.senderDns = { spfPresent: records[0].status === 'fulfilled' && records[0].value.some(parts => parts.join('').startsWith('v=spf1')), dmarcPresent: records[1].status === 'fulfilled' && records[1].value.some(parts => parts.join('').startsWith('v=DMARC1')) }
 // DKIM selectors and verification status belong to the chosen provider. Do not
 // invent selectors or treat SPF/DMARC presence as proof of deliverability.
}
if (apply) {
 if (templatesOnly && !current.smtp_host) throw new Error('Supabase requires a custom SMTP provider before changing templates on this plan. Templates are prepared in emails/; configure your sender first. No settings changed.')
 if (!templatesOnly && missing.length) throw new Error(`SMTP setup is incomplete: ${missing.join(', ')}. No settings changed.`)
 const templates = {}
 for (const [type, subject] of [['confirmation', 'Confirm your Manyfolds account'], ['recovery', 'Reset your Manyfolds password']]) {
  templates[`mailer_subjects_${type}`] = subject
  templates[`mailer_templates_${type}_content`] = await readFile(new URL(`../emails/${type}.html`, import.meta.url), 'utf8')
 }
 const patch = { ...templates, mailer_autoconfirm: false }
 if (!templatesOnly) {
  const port = Number(env.SMTP_PORT)
  if (![465, 587, 2525].includes(port)) throw new Error('Use the mail provider’s TLS SMTP submission port: 465, 587 or 2525.')
  if (!/^[a-z0-9.-]+$/i.test(env.SMTP_HOST) || !env.SMTP_HOST.includes('.')) throw new Error('SMTP_HOST must be a provider hostname without a protocol or path.')
  Object.assign(patch, { smtp_host: env.SMTP_HOST, smtp_port: String(port), smtp_user: env.SMTP_USER, smtp_pass: env.SMTP_PASS, smtp_admin_email: env.SMTP_FROM, smtp_sender_name: 'Manyfolds' })
 }
 const response = await fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify(patch), signal: AbortSignal.timeout(20_000) })
 if (!response.ok) throw new Error(`Email settings could not be updated (HTTP ${response.status}); inspect Supabase settings.`)
 const saved = await getConfig()
 for (const [key, value] of Object.entries(templates)) if (saved[key] !== value) throw new Error(`Read-back verification failed for ${key}.`)
 if (saved.mailer_autoconfirm !== false) throw new Error('Email confirmation must remain required.')
 if (!templatesOnly && (saved.smtp_host !== env.SMTP_HOST || saved.smtp_admin_email !== env.SMTP_FROM)) throw new Error('SMTP read-back verification failed.')
 report.templatesVerified = true
 report.customSmtpConfigured = Boolean(saved.smtp_host && saved.smtp_user && saved.smtp_pass)
 report.senderConfigured = Boolean(saved.smtp_admin_email)
}
console.log(JSON.stringify(report, null, 2))
