import type { Pool } from 'pg'
import type { AuthContext } from './types.ts'
import { RoadmapServiceError } from './service.ts'
import { extractNspListings, scholarshipIdForListing } from '../catalogue/nspListings.mjs'

const TASK_STATUSES = new Set([
  'pending_review',
  'in_progress',
  'verified',
  'unavailable',
  'closed',
])
const RECORD_STATUSES = new Set([
  'pending_review',
  'verified',
  'stale',
  'conflicting',
  'archived',
])

const requireAdmin = (auth: AuthContext, curatorIds: ReadonlySet<string>) => {
  if ((auth.role !== 'owner' && auth.role !== 'admin') || !curatorIds.has(auth.userId)) {
    throw new RoadmapServiceError('Catalogue verification is restricted to approved Manyfolds curators.', 403)
  }
}

const officialUrl = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch {
    return null
  }
}

export class VerificationAdminService {
  private pool: Pool
  private curatorIds: ReadonlySet<string>
  constructor(pool: Pool, curatorIds: ReadonlySet<string> = new Set()) {
    this.pool = pool
    this.curatorIds = curatorIds
  }

  async list(auth: AuthContext) {
    requireAdmin(auth, this.curatorIds)
    const [tasks, programmes, queueCounts, events, coverage, claimStats, sourceMonitors, candidates, gapStats, stateCoverage] = await Promise.all([
      this.pool.query(
        `select id,task_type,entity_type,entity_id,missing_field,official_domain,narrow_query,
                status,priority,claimed_by,claimed_at,reviewer_notes,conflict_notes,
                result_source_urls,created_at,updated_at
         from source_verification_tasks
         where organisation_id=$1
         order by case status when 'pending_review' then 0 when 'in_progress' then 1 else 2 end,
                  priority,created_at desc limit 100`,
        [auth.organisationId],
      ),
      this.pool.query(
        `select p.id,p.institution_id,i.institution_name,p.campus,p.programme_name,
                p.degree_level,p.course_id,p.duration,p.mode,p.verification_status,
                p.data_sufficient,p.official_programme_url,p.official_admissions_url,
                p.last_verified_at,s.id source_id,s.source_url,s.status source_status
         from institution_programmes p
         join institutions i on i.institution_id=p.institution_id
         left join lateral (
           select id,source_url,status from institution_programme_sources
           where institution_programme_id=p.id order by last_verified_at desc nulls last,id desc limit 1
         ) s on true
         where p.verification_status<>'verified' or not p.data_sufficient
         order by p.last_verified_at nulls first,p.programme_name limit 100`,
      ),
      this.pool.query(
        `select task_type,count(*)::int count
         from source_verification_tasks
         where organisation_id=$1 and status in ('pending_review','in_progress')
         group by task_type order by task_type`,
        [auth.organisationId],
      ),
      this.pool.query(
        `select id,record_type,record_id,action,previous_status,next_status,source_url,
                notes,created_at
         from catalogue_verification_events
         where organisation_id=$1 order by created_at desc limit 40`,
        [auth.organisationId],
      ),
      this.pool.query(
        `select 'Career titles' category,count(*)::int total,
                count(*) filter(where verification_status='official_taxonomy_title')::int published from careers
         union all
         select 'Courses',count(*)::int,
                count(*) filter(where c.verification_status='verified' and exists(
                  select 1 from catalogue_claims claim where claim.entity_type='course'
                    and claim.entity_id=c.course_id and claim.field_name='name'
                    and claim.claim_value=to_jsonb(c.course_name)
                    and claim.verification_status='verified'
                    and (claim.expires_at is null or claim.expires_at>=(now() at time zone 'Asia/Kolkata')::date)))::int from courses c
         union all
         select 'Institutions',count(*)::int,
                count(*) filter(where i.verification_status='verified' and exists(
                  select 1 from catalogue_claims claim where claim.entity_type='institution'
                    and claim.entity_id=i.institution_id and claim.field_name='name'
                    and claim.claim_value=to_jsonb(i.institution_name)
                    and claim.verification_status='verified'
                    and (claim.expires_at is null or claim.expires_at>=(now() at time zone 'Asia/Kolkata')::date)))::int from institutions i
         union all
         select 'Exams',count(*)::int,
                count(*) filter(where e.verification_status='verified' and exists(
                  select 1 from catalogue_claims claim where claim.entity_type='exam'
                    and claim.entity_id=e.exam_id and claim.field_name='name'
                    and claim.claim_value=to_jsonb(e.exam_name)
                    and claim.verification_status='verified'
                    and (claim.expires_at is null or claim.expires_at>=(now() at time zone 'Asia/Kolkata')::date)))::int from exams e
         union all
         select 'Scholarship listings',count(*)::int,
                count(*) filter(where s.verification_status in ('verified','verified_listing') and exists(
                  select 1 from catalogue_claims claim where claim.entity_type='scholarship'
                    and claim.entity_id=s.scholarship_id and claim.field_name='name'
                    and claim.claim_value=to_jsonb(s.scholarship_name)
                    and claim.verification_status='verified'
                    and (claim.expires_at is null or claim.expires_at>=(now() at time zone 'Asia/Kolkata')::date)))::int from scholarships s
         union all
         select 'Named programmes',count(*)::int,
                count(*) filter(where p.verification_status='verified' and exists(
                  select 1 from catalogue_claims claim where claim.entity_type='programme'
                    and claim.entity_id=p.institution_id||':'||p.programme_name
                    and claim.field_name='offering' and claim.claim_value=to_jsonb(p.programme_name)
                    and claim.verification_status='verified'
                    and (claim.expires_at is null or claim.expires_at>=(now() at time zone 'Asia/Kolkata')::date)))::int
           from institution_programmes p
         union all
         select 'Programmes with checked eligibility',count(*)::int,
                count(*) filter(where p.verification_status='verified' and p.data_sufficient and exists(
                  select 1 from institution_programme_eligibility e join catalogue_claims claim
                    on claim.entity_type='programme'
                    and claim.entity_id=p.institution_id||':'||p.programme_name
                    and claim.field_name='eligibility' and claim.claim_value=to_jsonb(e.required_subjects)
                    and claim.verification_status='verified'
                    and (claim.expires_at is null or claim.expires_at>=(now() at time zone 'Asia/Kolkata')::date)
                  where e.institution_programme_id=p.id and e.verification_status='verified'))::int
           from institution_programmes p`,
      ),
      this.pool.query(
        `select verification_status,count(*)::int total from catalogue_claims
         group by verification_status order by verification_status`,
      ),
      this.pool.query(
        `select monitor_key,source_url,source_kind,entity_scope,last_checked_at,
                last_http_status,changed_at,next_check_at
         from catalogue_source_monitors where active order by monitor_key`,
      ),
      this.pool.query(
        `select candidate_key,entity_type,source_url,source_cycle,payload,detected_at,status
         from catalogue_import_candidates where status='pending_review'
         order by detected_at desc,candidate_key limit 100`,
      ),
      this.pool.query(
        `select
           (select count(*)::int from catalogue_claims where verification_status='stale') stale_claims,
           (select count(*)::int from catalogue_claims where verification_status='conflicting') conflicting_claims,
           (select count(*)::int from catalogue_claims where verification_status='verified'
             and expires_at<(now() at time zone 'Asia/Kolkata')::date) expired_claims,
           (select count(*)::int from catalogue_claims where entity_type like '%relationship'
             and verification_status='verified' and (expires_at is null or expires_at>=(now() at time zone 'Asia/Kolkata')::date)) verified_relationship_claims,
           (select count(*)::int from institution_programmes p where p.verification_status='verified'
             and not exists(select 1 from catalogue_claims claim where claim.entity_type='programme'
               and claim.entity_id=p.institution_id||':'||p.programme_name
               and claim.field_name='fee' and claim.verification_status='verified'
               and (claim.expires_at is null or claim.expires_at>=(now() at time zone 'Asia/Kolkata')::date))) programmes_missing_fees,
           (select count(*)::int from catalogue_import_candidates where status='pending_review') pending_candidates`,
      ),
      this.pool.query(
        `select state,count(*)::int total,
                count(*) filter(where verified)::int published from (
           select coalesce(nullif(i.state,''),'Unknown') state,
                  i.verification_status='verified' and exists(
                    select 1 from catalogue_claims claim where claim.entity_type='institution'
                      and claim.entity_id=i.institution_id and claim.field_name='name'
                      and claim.claim_value=to_jsonb(i.institution_name)
                      and claim.verification_status='verified'
                      and (claim.expires_at is null or claim.expires_at>=(now() at time zone 'Asia/Kolkata')::date)) verified
           from institutions i) coverage
         group by state having count(*) filter(where verified)>0
         order by published desc,state limit 20`,
      ),
    ])
    return {
      tasks: tasks.rows,
      programmes: programmes.rows,
      queueCounts: queueCounts.rows,
      events: events.rows,
      coverage: coverage.rows,
      claimStats: claimStats.rows,
      sourceMonitors: sourceMonitors.rows,
      candidates: candidates.rows,
      gapStats: gapStats.rows[0],
      stateCoverage: stateCoverage.rows,
    }
  }

  async reviewCandidate(auth: AuthContext, candidateKey: string, payload: { action?: string; notes?: string }) {
    requireAdmin(auth, this.curatorIds)
    if (payload.action !== 'publish' && payload.action !== 'reject') throw new RoadmapServiceError('Choose publish or reject.', 422)
    const notes = payload.notes?.trim().slice(0, 4000) || ''
    if (!notes) throw new RoadmapServiceError('A reviewer note is required.', 422)
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const result = await client.query(
        `select * from catalogue_import_candidates where candidate_key=$1 for update`, [candidateKey],
      )
      if (!result.rowCount) throw new RoadmapServiceError('Candidate not found.', 404)
      const row = result.rows[0]
      if (row.status !== 'pending_review') throw new RoadmapServiceError('Candidate is no longer pending review.', 409)
      if (payload.action === 'publish') {
        if (row.entity_type !== 'scholarship' || row.source_url !== 'https://scholarships.gov.in/All-Scholarships' || row.source_cycle !== '2026-27') {
          throw new RoadmapServiceError('This source type cannot be published by this review action.', 422)
        }
        const listing = row.payload as { name?: string; deadline?: string; applicationState?: string; applicationMode?: string; cardHash?: string }
        if (!listing.name || !/^2026-\d{2}-\d{2}$/.test(listing.deadline || '') || listing.applicationState !== 'open' || listing.cardHash !== row.source_hash) {
          throw new RoadmapServiceError('Candidate details are incomplete or inconsistent.', 422)
        }
        const indiaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
        if (row.updated_at < new Date(Date.now() - 24 * 60 * 60 * 1000) || listing.deadline! < indiaToday) {
          throw new RoadmapServiceError('Candidate is old or its application window has ended. Refresh the source feed.', 409)
        }
        let currentListing: ReturnType<typeof extractNspListings>[number] | undefined
        try {
          const response = await fetch(row.source_url, { signal: AbortSignal.timeout(20_000) })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          currentListing = extractNspListings(await response.text())
            .find((item) => item.candidateKey === candidateKey)
        } catch {
          throw new RoadmapServiceError('The official NSP listing could not be rechecked. Try again after the source is available.', 503)
        }
        if (!currentListing || currentListing.cardHash !== row.source_hash) {
          throw new RoadmapServiceError('The official listing changed. Refresh the NSP staging feed before review.', 409)
        }
        const id = scholarshipIdForListing(currentListing)
        const date = new Date(`${listing.deadline}T00:00:00Z`)
        const window = `Student ${listing.applicationMode === 'renewal' ? 'renewal ' : ''}applications open till ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)}`
        await client.query(
          `insert into scholarships(scholarship_id,scholarship_name,provider,geographic_scope,application_window,official_url,verification_status,date_policy,last_reviewed)
           values($1,$2,'National Scholarship Portal','India',$3,$4,'verified_listing',$5,current_date::text)
           on conflict(scholarship_id) do update set scholarship_name=excluded.scholarship_name,application_window=excluded.application_window,
             verification_status='verified_listing',last_reviewed=excluded.last_reviewed`,
          [id, listing.name, window, row.source_url, `${row.source_cycle} cycle only`],
        )
        for (const [field, value] of [['name', listing.name], ['application_window', window]]) {
          await client.query(
            `insert into catalogue_claims(claim_key,entity_type,entity_id,field_name,claim_value,source_url,publisher,document_title,
                checked_at,reviewer,review_method,academic_cycle,expires_at,evidence_locator,source_hash,verification_status)
             values($1,'scholarship',$2,$3,to_jsonb($4::text),$5,'National Scholarship Portal','Schemes on NSP, academic year 2026-27',
                now(),$6,'human_confirmed',$7,$8,'Scheme card and student application closing date',$9,'verified')
             on conflict(claim_key) do update set claim_value=excluded.claim_value,checked_at=excluded.checked_at,reviewer=excluded.reviewer,
                review_method=excluded.review_method,expires_at=excluded.expires_at,source_hash=excluded.source_hash,verification_status='verified'`,
            [`scholarship:${id}:${field}`, id, field, value, row.source_url, auth.userId, row.source_cycle, listing.deadline, row.source_hash],
          )
        }
        await client.query(
          `insert into catalogue_verification_events(organisation_id,actor_id,record_type,record_id,action,next_status,source_url,notes)
           values($1,$2,'scholarship',$3,'candidate_published','verified_listing',$4,$5)`,
          [auth.organisationId, auth.userId, id, row.source_url, notes],
        )
      }
      await client.query(
        `update catalogue_import_candidates set status=$2,reviewed_by=$3,reviewed_at=now(),reviewer_notes=$4,updated_at=now()
         where candidate_key=$1`,
        [candidateKey, payload.action === 'publish' ? 'published' : 'rejected', auth.userId, notes],
      )
      await client.query('commit')
      return { candidateKey, status: payload.action === 'publish' ? 'published' : 'rejected' }
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async updateTask(
    auth: AuthContext,
    taskId: string,
    payload: {
      action?: string
      status?: string
      reviewerNotes?: string
      conflictNotes?: string
      resultSourceUrls?: string[]
    },
  ) {
    requireAdmin(auth, this.curatorIds)
    const existing = await this.pool.query(
      `select * from source_verification_tasks where id=$1 and organisation_id=$2`,
      [taskId, auth.organisationId],
    )
    if (!existing.rowCount) throw new RoadmapServiceError('Verification task not found.', 404)
    const row = existing.rows[0]
    const claim = payload.action === 'claim'
    const status = claim
      ? 'in_progress'
      : payload.status && TASK_STATUSES.has(payload.status)
        ? payload.status
        : row.status
    const sourceUrls = Array.isArray(payload.resultSourceUrls)
      ? payload.resultSourceUrls.map(officialUrl).filter(Boolean).slice(0, 10)
      : row.result_source_urls
    if (status === 'verified' && sourceUrls.length === 0) {
      throw new RoadmapServiceError('A verified task must retain at least one official source URL.', 422)
    }
    const updated = await this.pool.query(
      `update source_verification_tasks set
        status=$3,
        claimed_by=case when $4 then $5 else claimed_by end,
        claimed_at=case when $4 then now() else claimed_at end,
        reviewer_notes=coalesce($6,reviewer_notes),
        conflict_notes=coalesce($7,conflict_notes),
        result_source_urls=$8,
        resolved_at=case when $3 in ('verified','unavailable','closed') then now() else null end,
        updated_at=now()
       where id=$1 and organisation_id=$2 returning *`,
      [
        taskId,
        auth.organisationId,
        status,
        claim,
        auth.userId,
        typeof payload.reviewerNotes === 'string'
          ? payload.reviewerNotes.slice(0, 4000)
          : null,
        typeof payload.conflictNotes === 'string'
          ? payload.conflictNotes.slice(0, 4000)
          : null,
        sourceUrls,
      ],
    )
    await this.pool.query(
      `insert into catalogue_verification_events
       (organisation_id,actor_id,record_type,record_id,action,previous_status,next_status,
        source_url,notes,change_payload)
       values($1,$2,'verification_task',$3,$4,$5,$6,$7,$8,$9)`,
      [
        auth.organisationId,
        auth.userId,
        taskId,
        claim ? 'claimed' : 'status_changed',
        row.status,
        status,
        sourceUrls[0] || null,
        payload.reviewerNotes?.slice(0, 4000) || null,
        { taskType: row.task_type, conflictNotes: payload.conflictNotes || null },
      ],
    )
    return updated.rows[0]
  }

  async saveProgramme(auth: AuthContext, payload: Record<string, unknown>) {
    requireAdmin(auth, this.curatorIds)
    const institutionId =
      typeof payload.institutionId === 'string' ? payload.institutionId.trim() : ''
    const programmeName =
      typeof payload.programmeName === 'string' ? payload.programmeName.trim() : ''
    const sourceUrl = officialUrl(payload.officialProgrammeUrl)
    const admissionsUrl = officialUrl(payload.officialAdmissionsUrl)
    if (!institutionId || !programmeName || !sourceUrl) {
      throw new RoadmapServiceError(
        'Institution, exact programme name, and an official programme URL are required.',
        422,
      )
    }
    const institution = await this.pool.query(
      'select institution_id from institutions where institution_id=$1',
      [institutionId],
    )
    if (!institution.rowCount) throw new RoadmapServiceError('Institution record not found.', 404)
    if (typeof payload.courseId === 'string' && payload.courseId.trim()) {
      const course = await this.pool.query('select course_id from courses where course_id=$1', [
        payload.courseId.trim(),
      ])
      if (!course.rowCount) throw new RoadmapServiceError('Course record not found.', 404)
    }
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const programme = await client.query(
        `insert into institution_programmes
         (institution_id,campus,programme_name,degree_level,course_id,duration,mode,
          official_programme_url,official_admissions_url,source_domain,source_date,
          verification_status,data_sufficient,verification_notes)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,current_date,'needs_review',false,$11)
         on conflict(institution_id,programme_name) do update set
          campus=excluded.campus,degree_level=excluded.degree_level,course_id=excluded.course_id,
          duration=excluded.duration,mode=excluded.mode,
          official_programme_url=excluded.official_programme_url,
          official_admissions_url=excluded.official_admissions_url,
          source_domain=excluded.source_domain,source_date=excluded.source_date,
          verification_status='needs_review',data_sufficient=false,
          verification_notes=excluded.verification_notes
         returning id,verification_status`,
        [
          institutionId,
          typeof payload.campus === 'string' ? payload.campus.trim() || null : null,
          programmeName,
          typeof payload.degreeType === 'string' ? payload.degreeType.trim() || null : null,
          typeof payload.courseId === 'string' ? payload.courseId.trim() || null : null,
          typeof payload.duration === 'string' ? payload.duration.trim() || null : null,
          typeof payload.studyMode === 'string' ? payload.studyMode.trim() || null : null,
          sourceUrl,
          admissionsUrl,
          new URL(sourceUrl).hostname,
          typeof payload.notes === 'string' ? payload.notes.slice(0, 4000) : null,
        ],
      )
      const programmeId = programme.rows[0].id as string
      await client.query(
        `insert into institution_programme_sources
         (institution_programme_id,source_name,source_url,source_year,status)
         values($1,$2,$3,$4,'needs_review')`,
        [programmeId, new URL(sourceUrl).hostname, sourceUrl, String(new Date().getFullYear())],
      )
      await client.query(
        `insert into catalogue_verification_events
         (organisation_id,actor_id,record_type,record_id,action,next_status,source_url,notes)
         values($1,$2,'programme',$3,'imported_or_corrected','needs_review',$4,$5)`,
        [
          auth.organisationId,
          auth.userId,
          programmeId,
          sourceUrl,
          typeof payload.notes === 'string' ? payload.notes.slice(0, 4000) : null,
        ],
      )
      await client.query('commit')
      return { id: programmeId, verificationStatus: 'needs_review', dataSufficient: false }
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async reviewProgramme(
    auth: AuthContext,
    programmeId: string,
    payload: { status?: string; sourceStatus?: string; dataSufficient?: boolean; notes?: string },
  ) {
    requireAdmin(auth, this.curatorIds)
    const existing = await this.pool.query(
      `select p.*,s.id source_id,s.source_url,s.status source_status
       from institution_programmes p
       left join lateral (
         select id,source_url,status from institution_programme_sources
         where institution_programme_id=p.id order by id desc limit 1
       ) s on true where p.id=$1`,
      [programmeId],
    )
    if (!existing.rowCount) throw new RoadmapServiceError('Programme record not found.', 404)
    const row = existing.rows[0]
    const status =
      payload.status && RECORD_STATUSES.has(payload.status) ? payload.status : row.verification_status
    const sourceStatus =
      payload.sourceStatus && RECORD_STATUSES.has(payload.sourceStatus)
        ? payload.sourceStatus
        : row.source_status
    const dataSufficient =
      typeof payload.dataSufficient === 'boolean' ? payload.dataSufficient : row.data_sufficient
    if (
      status === 'verified' &&
      (!dataSufficient ||
        sourceStatus !== 'verified' ||
        !row.course_id ||
        !row.official_programme_url)
    ) {
      throw new RoadmapServiceError(
        'Verification requires a linked course, verified official source, programme URL, and complete-data confirmation.',
        422,
      )
    }
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      if (row.source_id && sourceStatus) {
        await client.query(
          `update institution_programme_sources set status=$2,
            last_verified_at=case when $2='verified' then now() else last_verified_at end
           where id=$1`,
          [row.source_id, sourceStatus === 'pending_review' ? 'needs_review' : sourceStatus],
        )
      }
      await client.query(
        `update institution_programmes set verification_status=$2,data_sufficient=$3,
          verified_by=case when $2='verified' then $4 else verified_by end,
          last_verified_at=case when $2='verified' then now() else last_verified_at end,
          verification_notes=coalesce($5,verification_notes)
         where id=$1`,
        [
          programmeId,
          status === 'pending_review' ? 'needs_review' : status,
          dataSufficient,
          auth.userId,
          typeof payload.notes === 'string' ? payload.notes.slice(0, 4000) : null,
        ],
      )
      await client.query(
        `insert into catalogue_verification_events
         (organisation_id,actor_id,record_type,record_id,action,previous_status,next_status,
          source_url,notes,change_payload)
         values($1,$2,'programme',$3,'reviewed',$4,$5,$6,$7,$8)`,
        [
          auth.organisationId,
          auth.userId,
          programmeId,
          row.verification_status,
          status,
          row.source_url,
          typeof payload.notes === 'string' ? payload.notes.slice(0, 4000) : null,
          { sourceStatus, dataSufficient },
        ],
      )
      await client.query('commit')
      return { id: programmeId, verificationStatus: status, sourceStatus, dataSufficient }
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }
}
