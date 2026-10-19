import { createHash } from 'node:crypto'
import type { Pool } from 'pg'
import type { RoadmapEvidencePackage } from './types.ts'

// Stored separately from the model input: review checks must not spend prompt
// tokens on database audit metadata. Checked-at timestamps intentionally don't
// invalidate a draft when a recheck confirms the exact same fact.
export async function roadmapSourceState(pool: Pool, evidence: RoadmapEvidencePackage) {
 const sources = evidence.source_records.filter(source => source.verification_status === 'verified')
 if (!sources.length) return 'no-catalogue-sources'
 const urls = [...new Set(sources.map(source => source.source_url))].sort()
 const claims = await pool.query(`select claim_key,entity_type,entity_id,field_name,claim_value,source_url,academic_cycle,expires_at::text,verification_status,
  (expires_at is null or expires_at>=(now() at time zone 'Asia/Kolkata')::date) unexpired
  from catalogue_claims where source_url=any($1::text[]) order by claim_key`, [urls])
 const careers = await pool.query(`select career_id,title,source_url,verification_status from careers where career_id=any($1::text[]) order by career_id`, [sources.filter(source => source.entity_type === 'career').map(source => source.entity_id)])
 const programmes = await pool.query(`select p.id::text,p.programme_name,p.institution_id,p.course_id,p.duration,p.verification_status,p.data_sufficient,
  (select jsonb_agg(jsonb_build_object('url',s.source_url,'status',s.status) order by s.id) from institution_programme_sources s where s.institution_programme_id=p.id) sources,
  (select jsonb_agg(to_jsonb(e)-'updated_at'-'created_at' order by e.id) from institution_programme_eligibility e where e.institution_programme_id=p.id) eligibility
  from institution_programmes p where p.id::text=any($1::text[]) order by p.id`, [sources.filter(source => source.entity_type === 'programme').map(source => source.entity_id)])
 return createHash('sha256').update(JSON.stringify({ claims: claims.rows, careers: careers.rows, programmes: programmes.rows })).digest('hex')
}
