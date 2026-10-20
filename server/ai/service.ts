import {AccessError,assertStudentAccess,canGuide,canCounsel} from '../access.ts'
import { createHash } from 'node:crypto'
import type { Pool } from 'pg'
import type { AiConfig } from './config.ts'
import { queueVerificationNeeds } from './currentData.ts'
import { buildEvidencePackage, MissingEvidenceError } from './evidence.ts'
import { callOpenRouter, OpenRouterError } from './openrouter.ts'
import { rankAllowedModels, recordModelHealth } from './models.ts'
import { ROADMAP_PROMPT_VERSION } from './prompt.ts'
import { compactEvidence, remainingOutputBudget, TokenBudgetError } from './tokens.ts'
import { parseAndValidateRoadmap } from './validation.ts'
import { roadmapSourceState } from './sourceState.ts'
import { diagnosticProfileHash } from './profileState.ts'
import type {
  AuthContext,
  CompactSourceRecord,
  GenerationRequest,
  RoadmapEvidencePackage,
  RoadmapOutput,
} from './types.ts'

const ENGINE_VERSION = 'manyfolds-ai-roadmap-1'
const NOTICE = 'AI-assisted roadmap based on your profile and verified Manyfolds data.'

export class RoadmapServiceError extends Error {
  readonly statusCode: number
  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'RoadmapServiceError'
    this.statusCode = statusCode
  }
}

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

const safeError = (error: unknown) => {
  if (error instanceof AccessError) return new RoadmapServiceError(error.message,error.statusCode)
  if (error instanceof RoadmapServiceError) return error
  if (error instanceof TokenBudgetError) return new RoadmapServiceError(error.message, 413)
  if (error instanceof MissingEvidenceError) return new RoadmapServiceError(error.message, 422)
  if (error instanceof OpenRouterError) return new RoadmapServiceError(error.message, 503)
  return new RoadmapServiceError(
    'We could not generate the roadmap right now. Your saved profile and recommendations are unchanged.',
    500,
  )
}

export class RoadmapService {
  private readonly pool: Pool
  private readonly config: AiConfig

  constructor(pool: Pool, config: AiConfig) {
    this.pool = pool
    this.config = config
  }

  private async profileIsCurrent(auth:AuthContext,studentKey:string,profileHash:string|null){
    const result=await this.pool.query(`select profile,status from student_diagnostic_history where organisation_id=$1 and student_key=$2 order by revision desc limit 1`,[auth.organisationId,studentKey])
    return !result.rowCount || (['ready','review_requested'].includes(result.rows[0].status) && profileHash === diagnosticProfileHash(result.rows[0].profile))
  }

  private async evidenceSnapshot(
    auth: AuthContext,
    studentExternalId: string,
    evidence: RoadmapEvidencePackage,
    evidenceHash: string,
    tokenEstimate: number,
    sourceStateHash: string,
    profileHash: string,
  ) {
    const result = await this.pool.query(
      `insert into roadmap_evidence_snapshots
       (organisation_id,student_external_id,evidence_hash,evidence,input_token_estimate,source_state_hash,diagnostic_profile_hash)
       values($1,$2,$3,$4,$5,$6,$7)
       on conflict(organisation_id,student_external_id,evidence_hash)
       do update set input_token_estimate=excluded.input_token_estimate
       returning id`,
      [auth.organisationId, studentExternalId, evidenceHash, evidence, tokenEstimate, sourceStateHash, profileHash],
    )
    return result.rows[0].id as string
  }

  private async safeGenerationResponse(
    row: {
      id: string
      version: number
      counsellor_notes?: string
      roadmap: RoadmapOutput
      status: string
      generated_at: string
      updated_at: string
      model_generated_notice: string
      validation_errors: unknown
      evidence_snapshot_id: string
    },
    cached: boolean,
    auth: AuthContext,
  ) {
    const evidenceResult = await this.pool.query(
      `select evidence,source_state_hash,student_external_id,diagnostic_profile_hash from roadmap_evidence_snapshots where id=$1`,
      [row.evidence_snapshot_id],
    )
    const evidence = evidenceResult.rows[0]?.evidence as RoadmapEvidencePackage | undefined
    const sourcesCurrent = evidence ? evidenceResult.rows[0]?.source_state_hash === await roadmapSourceState(this.pool, evidence) || !evidence.source_records.some(source => source.verification_status === 'verified') : false
    const profileCurrent=await this.profileIsCurrent(auth,evidenceResult.rows[0]?.student_external_id,evidenceResult.rows[0]?.diagnostic_profile_hash)
    if (evidence) {
      const validation = parseAndValidateRoadmap(row.roadmap, evidence)
      if (!validation.schemaValid || !validation.factualValid) return null
    }
    return {
      id: row.id,
      sourcesCurrent,
      profileCurrent,
      version: row.version,
      counsellorNotes: canCounsel(auth.role)?row.counsellor_notes:undefined,
      roadmap: row.roadmap,
      status: row.status,
      generatedAt: row.generated_at,
      updatedAt: row.updated_at,
      notice: evidence?.source_records.some(source => source.verification_status === 'verified')
        ? row.model_generated_notice
        : 'AI-generated exploration guidance based on the saved profile. No source-verified admissions guidance is included.',
      validationWarnings: Array.isArray(row.validation_errors)
        ? row.validation_errors.filter((item): item is string => typeof item === 'string')
        : [],
      sources: evidence?.source_records || [],
      verifiedDates: (evidence?.verified_admission_cycles || [])
        .filter((cycle) => Boolean(cycle.application_deadline))
        .map((cycle) => ({
          deadline: cycle.application_deadline,
          cycle: cycle.cycle,
          programmeName: evidence?.verified_programmes.find((programme) => programme.programme_id === cycle.programme_id)?.programme_name || 'Programme',
          sourceUrl: evidence?.source_records.find((source) => cycle.source_record_ids.includes(source.record_id))?.source_url || '',
        })),
      missingData: evidence?.missing_data || [],
      cached,
    }
  }

  async latest(auth: AuthContext, studentExternalId = `diagnostic-${auth.userId}`) {
    if(!canGuide(auth.role))throw new RoadmapServiceError('Your role cannot open diagnostic roadmaps.',403)
    if(studentExternalId!==`diagnostic-${auth.userId}`)await assertStudentAccess(this.pool,auth,studentExternalId)
    const result = await this.pool.query(
      `select id,version,counsellor_notes,roadmap,status,generated_at,updated_at,model_generated_notice,
              validation_errors,evidence_snapshot_id
       from roadmap_generations
       where organisation_id=$1 and student_external_id=$2
       order by generated_at desc limit 1`,
      [auth.organisationId, studentExternalId],
    )
    if (!result.rowCount) return null
    const generation = await this.safeGenerationResponse(result.rows[0], true,auth)
    if (!generation) throw new RoadmapServiceError('The saved AI draft no longer passes verification. Generate a new draft using current evidence.', 422)
    return generation
  }

  async generate(auth: AuthContext, request: GenerationRequest) {
    const deadline = Date.now() + 100_000
    try {
      if(!canGuide(auth.role))throw new RoadmapServiceError('Your role cannot generate roadmaps.',403)
      if(request.studentExternalId)await assertStudentAccess(this.pool,auth,request.studentExternalId)
      if (!request.profile || !request.primaryCareer?.name) {
        throw new RoadmapServiceError('A completed profile and selected career are required.')
      }
      if(request.studentExternalId){const student=await this.pool.query('select 1 from student_registry_records where organisation_id=$1 and external_key=$2 and archived_at is null',[auth.organisationId,request.studentExternalId]);if(!student.rowCount)throw new RoadmapServiceError('This student is unavailable or archived in your school.',404)}
      if (request.studentExternalId) {
        const saved = await this.pool.query('select profile,status from student_diagnostic_history where organisation_id=$1 and student_key=$2 order by revision desc limit 1',[auth.organisationId,request.studentExternalId])
        if (!saved.rowCount || !['ready','review_requested'].includes(saved.rows[0].status)) throw new RoadmapServiceError('Complete and save this student’s career diagnostic before generating an AI roadmap.',422)
        request = {...request,profile:saved.rows[0].profile}
      }
      const profileHash = diagnosticProfileHash(request.profile)
      const evidence = await buildEvidencePackage(this.pool, auth, request)
      const compacted = compactEvidence(evidence, this.config)
      const studentExternalId = compacted.evidence.student.student_id
      const sourceStateHash = await roadmapSourceState(this.pool, compacted.evidence)
      const evidenceHash = hash({ evidence: compacted.evidence, sourceStateHash, profileHash })
      const generationHash = hash({
        evidenceHash,
        prompt: ROADMAP_PROMPT_VERSION,
        engine: ENGINE_VERSION,
        maxOutputTokens: this.config.maxOutputTokens,
      })
      const snapshotId = await this.evidenceSnapshot(
        auth,
        studentExternalId,
        compacted.evidence,
        evidenceHash,
        compacted.estimatedInputTokens,
        sourceStateHash,
        profileHash,
      )

      if (!request.force) {
        const cached = await this.pool.query(
          `select id,version,counsellor_notes,roadmap,status,generated_at,updated_at,model_generated_notice,
                  validation_errors,evidence_snapshot_id
           from roadmap_generations
           where organisation_id=$1 and student_external_id=$2 and generation_hash=$3
             and status in ('draft','reviewed','approved','published')
           limit 1`,
          [auth.organisationId, studentExternalId, generationHash],
        )
        if (cached.rowCount) {
          const cachedGeneration = await this.safeGenerationResponse(cached.rows[0], true,auth)
          if (cachedGeneration?.sourcesCurrent&&cachedGeneration.profileCurrent) return cachedGeneration
        }
      }

      await queueVerificationNeeds(this.pool, auth, this.config, compacted.evidence)
      if (!this.config.apiKey) {
        throw new RoadmapServiceError(
          'AI roadmap generation is not configured yet. Your deterministic roadmap remains available.',
          503,
        )
      }

      const models = await rankAllowedModels(this.pool, this.config)
      if (!models.length) {
        throw new RoadmapServiceError('No healthy reviewed roadmap model is currently available.', 503)
      }
      const session = await this.pool.query(
        `insert into ai_generation_sessions
         (organisation_id,student_external_id,counsellor_id,model_requested,prompt_version,
          evidence_snapshot_id,status)
         values($1,$2,$3,$4,$5,$6,'in_progress') returning id`,
        [
          auth.organisationId,
          studentExternalId,
          auth.userId,
          this.config.primaryModel || models[0].id,
          ROADMAP_PROMPT_VERSION,
          snapshotId,
        ],
      )
      const sessionId = session.rows[0].id as string

      let usedTokens = 0
      let attempt = 0
      let lastError: Error | null = null
      let sessionInputTokens = 0
      let sessionOutputTokens = 0
      let sessionReasoningTokens = 0
      let sessionReportedCost = 0
      let sessionEstimatedCost = 0
      let sessionLatencyMs = 0
      let retryPrimary = false
      const attempts = [models[0], models[0], models[1]].filter(Boolean)
      for (const [index, model] of attempts.entries()) {
        if (index === 1 && !retryPrimary) continue
        attempt += 1
        const maxOutput = remainingOutputBudget(
          this.config,
          usedTokens,
          compacted.estimatedInputTokens,
        )
        if (maxOutput < 128) break

        try {
          const remainingMs = deadline - Date.now()
          if (remainingMs < 1_000) {
            throw new RoadmapServiceError('Roadmap generation took too long. Please try again.', 503)
          }
          const response = await callOpenRouter(
            this.config,
            model.id,
            compacted.evidence,
            maxOutput,
            model.supportsReasoning,
            index === 1,
            remainingMs,
          )
          const conservativeInput = Math.max(
            response.usage.inputTokens,
            compacted.estimatedInputTokens,
          )
          const conservativeTotal =
            conservativeInput + response.usage.outputTokens + response.usage.reasoningTokens
          usedTokens += conservativeTotal
          sessionInputTokens += conservativeInput
          sessionOutputTokens += response.usage.outputTokens
          sessionReasoningTokens += response.usage.reasoningTokens
          sessionReportedCost += response.usage.reportedCost || 0
          sessionEstimatedCost += Number.isFinite(model.estimatedCost)
            ? model.estimatedCost
            : 0
          sessionLatencyMs += response.latencyMs
          await this.pool.query(
            `insert into ai_usage_records
             (organisation_id,session_id,model_id,attempt,input_tokens,output_tokens,
              reasoning_tokens,total_tokens,estimated_cost,reported_cost,latency_ms)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              auth.organisationId,
              sessionId,
              response.modelUsed,
              attempt,
              conservativeInput,
              response.usage.outputTokens,
              response.usage.reasoningTokens,
              conservativeTotal,
              model.estimatedCost,
              response.usage.reportedCost,
              response.latencyMs,
            ],
          )
          if (usedTokens > this.config.maxTotalTokens) {
            throw new TokenBudgetError('The provider reported usage above the session token ceiling.')
          }

          const validation = parseAndValidateRoadmap(response.rawRoadmap, compacted.evidence, true)
          await recordModelHealth(
            this.pool,
            response.modelUsed,
            validation.schemaValid && validation.factualValid,
            response.latencyMs,
            validation.schemaValid,
          )
          if (!validation.schemaValid || !validation.roadmap) {
            lastError = new RoadmapServiceError('The AI response could not be saved as a valid roadmap. Please try again.', 422)
            if (index === 0) retryPrimary = true
            await this.pool.query(
              `insert into ai_validation_failures
               (organisation_id,session_id,validation_stage,errors,repaired_locally)
               values($1,$2,'schema',$3,false)`,
              [auth.organisationId, sessionId, JSON.stringify(validation.errors)],
            )
            continue
          }

          if (!validation.factualValid) {
            lastError = new RoadmapServiceError('The AI response failed source or constraint verification. Please try again.', 422)
            if (index === 0) retryPrimary = true
            await this.pool.query(
              `insert into ai_validation_failures
               (organisation_id,session_id,validation_stage,errors,repaired_locally)
               values($1,$2,'factual',$3,$4)`,
              [auth.organisationId, sessionId, JSON.stringify(validation.errors), validation.repaired],
            )
            continue
          }

          if (validation.errors.length) {
            await this.pool.query(
              `insert into ai_validation_failures
               (organisation_id,session_id,validation_stage,errors,repaired_locally)
               values($1,$2,'factual',$3,$4)`,
              [auth.organisationId, sessionId, JSON.stringify(validation.errors), validation.repaired],
            )
          }

          const roadmapRow = await this.pool.query(
            `insert into student_roadmaps
             (organisation_id,student_external_id,target_career_id,engine_version,status,
              missing_data_warnings,generated_at)
             values($1,$2,$3,$4,'draft',$5,now()) returning id`,
            [
              auth.organisationId,
              studentExternalId,
              validation.roadmap.career_id,
              ENGINE_VERSION,
              compacted.evidence.missing_data,
            ],
          )
          const studentRoadmapId = roadmapRow.rows[0].id as string
          for (const [index, stage] of validation.roadmap.stages.entries()) {
            await this.pool.query(
              `insert into student_roadmap_steps
               (roadmap_id,phase,sequence,title,detail,mandatory,due_date,source_url)
               values($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                studentRoadmapId,
                stage.stage,
                index + 1,
                stage.title,
                stage.description,
                stage.mandatory,
                stage.verified_deadline || stage.suggested_target_date || null,
                compacted.evidence.source_records.find((source) =>
                  stage.source_record_ids.includes(source.record_id),
                )?.source_url || null,
              ],
            )
          }

          const generation = await this.pool.query(
            `insert into roadmap_generations
             (organisation_id,student_external_id,counsellor_id,student_roadmap_id,
              evidence_snapshot_id,generation_hash,prompt_version,engine_version,roadmap,status,
              model_generated_notice,source_status_summary,schema_valid,
              factual_validation_valid,validation_errors)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11,true,$12,$13)
             on conflict(organisation_id,student_external_id,generation_hash)
             do update set roadmap=excluded.roadmap,validation_errors=excluded.validation_errors,
               student_roadmap_id=excluded.student_roadmap_id,status='draft',
               reviewed_at=null,approved_at=null,version=roadmap_generations.version+1,
               schema_valid=excluded.schema_valid,factual_validation_valid=excluded.factual_validation_valid,
               generated_at=now(),updated_at=now(),updated_by=excluded.counsellor_id
             returning id,version,counsellor_notes,roadmap,status,generated_at,updated_at,model_generated_notice,
               validation_errors,evidence_snapshot_id`,
            [
              auth.organisationId,
              studentExternalId,
              auth.userId,
              studentRoadmapId,
              snapshotId,
              generationHash,
              ROADMAP_PROMPT_VERSION,
              ENGINE_VERSION,
              validation.roadmap,
              NOTICE,
              {
                verified: compacted.evidence.source_records.filter(
                  (source) => source.verification_status === 'verified',
                ).length,
                missing: compacted.evidence.missing_data.length,
              },
              validation.factualValid,
              JSON.stringify(validation.errors),
            ],
          )
          const generationId = generation.rows[0].id as string
          await this.persistSources(generationId, compacted.evidence.source_records)
          await this.pool.query(
            `update ai_generation_sessions set
              roadmap_generation_id=$2,model_used=$3,provider='openrouter',
              input_tokens=$4,output_tokens=$5,reasoning_tokens=$6,total_tokens=$7,
              estimated_cost=$8,reported_cost=$9,live_search_used=false,live_search_count=0,
              schema_valid=true,factual_validation_valid=$10,validation_errors=$11,
              retry_count=$12,latency_ms=$13,status='success'
             where id=$1`,
            [
              sessionId,
              generationId,
              response.modelUsed,
              sessionInputTokens,
              sessionOutputTokens,
              sessionReasoningTokens,
              usedTokens,
              sessionEstimatedCost || null,
              sessionReportedCost || null,
              validation.factualValid,
              JSON.stringify(validation.errors),
              attempt - 1,
              sessionLatencyMs,
            ],
          )
          return this.safeGenerationResponse(generation.rows[0], false,auth)
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Provider failure')
          console.error('AI roadmap model attempt failed', {
            modelId: model.id,
            kind: lastError.name,
            providerStatus: error instanceof OpenRouterError ? error.statusCode : null,
          })
          if (error instanceof OpenRouterError) {
            await recordModelHealth(this.pool, model.id, false, 0, false).catch(() => {})
            if (index === 0 && /invalid structured response|invalid response|empty response/.test(error.message)) retryPrimary = true
          }
          if (error instanceof TokenBudgetError) break
          if (error instanceof OpenRouterError && !error.retryable) break
          if (
            usedTokens + compacted.estimatedInputTokens + 128 >
            this.config.maxTotalTokens
          ) {
            break
          }
        }
      }

      await this.pool.query(
        `update ai_generation_sessions set input_tokens=$2,output_tokens=$3,reasoning_tokens=$4,
          total_tokens=$5,estimated_cost=$6,reported_cost=$7,retry_count=$8,
          latency_ms=$9,status='failed',validation_errors=$10 where id=$1`,
        [
          sessionId,
          sessionInputTokens,
          sessionOutputTokens,
          sessionReasoningTokens,
          usedTokens,
          sessionEstimatedCost || null,
          sessionReportedCost || null,
          Math.max(0, attempt - 1),
          sessionLatencyMs || null,
          JSON.stringify([lastError?.message || 'Generation failed']),
        ],
      )
      throw lastError || new RoadmapServiceError('No model attempt fit within the session token budget.')
    } catch (error) {
      console.error('AI roadmap generation failed', {
        kind: error instanceof Error ? error.name : 'UnknownError',
        code: error && typeof error === 'object' && 'code' in error ? String(error.code) : null,
        providerStatus: error instanceof OpenRouterError ? error.statusCode : null,
      })
      throw safeError(error)
    }
  }

  private async persistSources(generationId: string, sources: CompactSourceRecord[]) {
    for (const source of sources) {
      if (!source.source_url) continue
      let sourceRow = await this.pool.query(
        `select id from source_records
         where organisation_id is null and entity_type=$1 and entity_id=$2
           and source_url=$3 and coalesce(admission_cycle,'')=coalesce($4,'')
         order by created_at desc limit 1`,
        [source.entity_type, source.entity_id, source.source_url, source.admission_cycle],
      )
      if (!sourceRow.rowCount) {
        sourceRow = await this.pool.query(
          `insert into source_records
           (organisation_id,entity_type,entity_id,source_url,source_domain,source_type,
            admission_cycle,last_verified_at,verification_status,confidence,payload)
           values(null,$1,$2,$3,$4,'official',$5,$6,$7,$8,$9) returning id`,
          [
            source.entity_type,
            source.entity_id,
            source.source_url,
            source.source_domain,
            source.admission_cycle,
            source.last_verified_at,
            source.verification_status,
            source.verification_status === 'verified' ? 1 : 0.5,
            { name: source.name },
          ],
        )
      }
      await this.pool.query(
        `insert into roadmap_generation_sources
         (roadmap_generation_id,source_record_id,supplied_record_id)
         values($1,$2,$3) on conflict do nothing`,
        [generationId, sourceRow.rows[0].id, source.record_id],
      )
    }
  }

  async exportApproved(auth: AuthContext, generationId: string, expectedVersion: unknown) {
    if(!canGuide(auth.role))throw new RoadmapServiceError('Only counselling staff can export an approved roadmap.',403)
    if(!Number.isSafeInteger(expectedVersion))throw new RoadmapServiceError('Reload the roadmap before exporting.',409)
    const result=await this.pool.query(`select g.*,s.payload->>'name' student_name,o.name school_name,
      coalesce(nullif(u.raw_user_meta_data->>'display_name',''),nullif(u.raw_user_meta_data->>'full_name',''),'School staff') author
      from roadmap_generations g join student_registry_records s on s.organisation_id=g.organisation_id and s.external_key=g.student_external_id and s.archived_at is null
      join organisations o on o.id=g.organisation_id join auth.users u on u.id=$3
      where g.id=$1 and g.organisation_id=$2`,[generationId,auth.organisationId,auth.userId])
    const row=result.rows[0]
    if(!row)throw new RoadmapServiceError('Roadmap not found for an active student in your school.',404)
    await assertStudentAccess(this.pool,auth,row.student_external_id)
    if(row.version!==expectedVersion)throw new RoadmapServiceError('This roadmap changed. Reload before exporting.',409)
    if(!['approved','published'].includes(row.status))throw new RoadmapServiceError('Review and approve this roadmap before creating a shareable document.',409)
    const generation=await this.safeGenerationResponse(row,false,auth)
    if(!generation||!generation.sourcesCurrent||!generation.profileCurrent)throw new RoadmapServiceError('Refresh and review this roadmap before exporting; its evidence or diagnostic answers have changed.',422)
    const document={studentName:row.student_name,schoolName:row.school_name,author:row.author,generatedAt:new Date().toISOString(),roadmapGeneratedAt:row.generated_at,status:row.status,version:row.version,roadmap:generation.roadmap,sources:generation.sources.filter(source=>source.verification_status==='verified')}
    await this.pool.query(`insert into school_audit_events(organisation_id,actor_id,event_type,subject_key,metadata) values($1,$2,'export.approved_ai_roadmap',$3,$4)`,[auth.organisationId,auth.userId,row.student_external_id,{generationId,version:row.version}])
    return document
  }

  async update(
    auth: AuthContext,
    generationId: string,
    payload: { status?: string; counsellorNotes?: string; roadmap?: unknown; expectedVersion?:number },
  ) {
    if(!canGuide(auth.role))throw new RoadmapServiceError('Your role cannot review roadmaps.',403)
    if(!canCounsel(auth.role)&&(payload.counsellorNotes!==undefined||['reviewed','approved','published'].includes(payload.status||'')))throw new RoadmapServiceError('A counsellor must review and approve this draft.',403)
    if(!Number.isSafeInteger(payload.expectedVersion)||Number(payload.expectedVersion)<1)throw new RoadmapServiceError('Reload the roadmap to obtain its current version.',409)
    const existing = await this.pool.query(
      `select g.*,e.evidence,e.source_state_hash,e.diagnostic_profile_hash
       from roadmap_generations g join roadmap_evidence_snapshots e on e.id=g.evidence_snapshot_id
       where g.id=$1 and g.organisation_id=$2
         and not exists(select 1 from student_registry_records s where s.organisation_id=g.organisation_id
           and s.external_key=g.student_external_id and s.archived_at is not null)`,
      [generationId, auth.organisationId],
    )
    if (!existing.rowCount) throw new RoadmapServiceError('Roadmap not found.', 404)
    const row = existing.rows[0]
    if(row&&row.student_external_id!==`diagnostic-${auth.userId}`)await assertStudentAccess(this.pool,auth,row.student_external_id)
    if(row.version!==payload.expectedVersion)throw new RoadmapServiceError('This roadmap changed elsewhere. Reload before saving again.',409)
    let roadmap = row.roadmap as RoadmapOutput
    let validationErrors = Array.isArray(row.validation_errors)
      ? row.validation_errors.filter((item: unknown): item is string => typeof item === 'string')
      : []
    if (payload.roadmap) {
      const validation = parseAndValidateRoadmap(
        payload.roadmap,
        row.evidence as RoadmapEvidencePackage,
      )
      if (!validation.schemaValid || !validation.factualValid || !validation.roadmap) {
        throw new RoadmapServiceError('The edited roadmap did not pass validation.', 422)
      }
      roadmap = validation.roadmap
      validationErrors = validation.errors
    }
    const transitions:Record<string,string[]>={draft:['draft','reviewed','rejected'],reviewed:['draft','reviewed','approved','rejected'],approved:['draft','approved','published','rejected'],published:['draft','published'],rejected:['draft','rejected']}
    const nextStatus=payload.status||(payload.roadmap?'draft':row.status)
    if(!transitions[row.status]?.includes(nextStatus))throw new RoadmapServiceError('Review the draft before approval, and approve it before publication.',409)
    if(payload.roadmap&&nextStatus!=='draft')throw new RoadmapServiceError('Save content edits as a draft, then review the saved version.',409)
    if((payload.status||payload.roadmap)&&['reviewed','approved','published'].includes(nextStatus)){
      if(!await this.profileIsCurrent(auth,row.student_external_id,row.diagnostic_profile_hash))throw new RoadmapServiceError('The diagnostic answers changed after this draft. Generate and review a roadmap using the latest saved diagnostic.',422)
      const validation=parseAndValidateRoadmap(roadmap,row.evidence as RoadmapEvidencePackage)
      if(!validation.schemaValid||!validation.factualValid||!row.schema_valid||!row.factual_validation_valid)throw new RoadmapServiceError('This roadmap must pass evidence validation before review or publication.',422)
      const evidence = row.evidence as RoadmapEvidencePackage
      if (evidence.source_records.some(source => source.verification_status === 'verified') &&
          (!row.source_state_hash || row.source_state_hash !== await roadmapSourceState(this.pool, evidence))) {
        throw new RoadmapServiceError('Official evidence has changed or expired since this draft was generated. Regenerate and review it before approval or publication.', 422)
      }
    }
    const updated = await this.pool.query(
      `update roadmap_generations set roadmap=$3,status=$4,counsellor_notes=$5,
        validation_errors=$6,reviewed_at=case when $4 in ('draft','rejected') then null when $4='reviewed' and status<>'reviewed' then now() else reviewed_at end,
        approved_at=case when $4 in ('draft','reviewed','rejected') then null when $4='approved' and status<>'approved' then now() else approved_at end,
        updated_at=now(),version=version+1,updated_by=$8
       where id=$1 and organisation_id=$2 and version=$7
       returning id,version,counsellor_notes,roadmap,status,generated_at,updated_at,model_generated_notice,
         validation_errors,evidence_snapshot_id`,
      [
        generationId,
        auth.organisationId,
        roadmap,
        nextStatus,
        typeof payload.counsellorNotes === 'string'
          ? payload.counsellorNotes.slice(0, 4000)
          : row.counsellor_notes,
        JSON.stringify(validationErrors),
        payload.expectedVersion,auth.userId,
      ],
    )
    if(!updated.rowCount)throw new RoadmapServiceError('This roadmap changed elsewhere. Reload before saving again.',409)
    return this.safeGenerationResponse(updated.rows[0], false,auth)
  }
}
