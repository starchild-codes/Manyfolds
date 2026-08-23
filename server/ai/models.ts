import type { Pool } from 'pg'
import type { AiConfig } from './config.ts'

type CatalogueModel = {
  id: string
  name?: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string; request?: string }
  supported_parameters?: string[]
  architecture?: Record<string, unknown>
}

export type RankedModel = {
  id: string
  estimatedCost: number
  supportsReasoning: boolean
}

const price = (value: string | undefined) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.POSITIVE_INFINITY
}

const estimatedCost = (model: CatalogueModel) =>
  price(model.pricing?.prompt) * 2800 +
  price(model.pricing?.completion) * 1700 +
  (Number.isFinite(price(model.pricing?.request)) ? price(model.pricing?.request) : 0)

const supportsRoadmap = (model: CatalogueModel) => {
  const supported = new Set(model.supported_parameters || [])
  const architecture = model.architecture || {}
  const modality = JSON.stringify(architecture).toLowerCase()
  const outputModalities = String(architecture.output_modalities || '').toLowerCase()
  const hasTextOutput = !outputModalities || outputModalities.includes('text') || /(?:^|[^a-z])text\s*(?:→|->)/.test(modality)
  return (
    !model.id.includes(':free') &&
    !/(experimental|preview|beta)/i.test(model.id) &&
    !/(embedding|moderation|rerank|transcription|speech)/.test(modality) &&
    hasTextOutput &&
    (model.context_length || 0) >= 5000 &&
    supported.has('response_format') &&
    supported.has('structured_outputs') &&
    (supported.has('max_tokens') || supported.has('max_completion_tokens'))
  )
}

async function refreshCatalogue(pool: Pool, config: AiConfig) {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error('OpenRouter model catalogue is unavailable')
  const payload = (await response.json()) as { data?: CatalogueModel[] }
  const models = (payload.data || []).filter((model) => model.id)
  for (const model of models) {
    const cost = estimatedCost(model)
    await pool.query(
      `insert into ai_model_catalogue
       (model_id,display_name,context_length,prompt_price_per_token,completion_price_per_token,
        request_fee,supported_parameters,architecture,estimated_roadmap_cost,available,fetched_at,raw_metadata)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,true,now(),$10)
       on conflict(model_id) do update set
        display_name=excluded.display_name,context_length=excluded.context_length,
        prompt_price_per_token=excluded.prompt_price_per_token,
        completion_price_per_token=excluded.completion_price_per_token,
        request_fee=excluded.request_fee,supported_parameters=excluded.supported_parameters,
        architecture=excluded.architecture,estimated_roadmap_cost=excluded.estimated_roadmap_cost,
        available=true,fetched_at=now(),raw_metadata=excluded.raw_metadata`,
      [
        model.id,
        model.name || model.id,
        model.context_length || null,
        Number.isFinite(price(model.pricing?.prompt)) ? price(model.pricing?.prompt) : null,
        Number.isFinite(price(model.pricing?.completion)) ? price(model.pricing?.completion) : null,
        Number.isFinite(price(model.pricing?.request)) ? price(model.pricing?.request) : null,
        model.supported_parameters || [],
        model.architecture || {},
        Number.isFinite(cost) ? cost : null,
        model,
      ],
    )
  }
  return models
}

export async function rankAllowedModels(pool: Pool, config: AiConfig): Promise<RankedModel[]> {
  if (!config.allowedModels.length) {
    throw new Error('No reviewed OpenRouter model allowlist is configured')
  }

  const latest = await pool.query(
    'select max(fetched_at) latest from ai_model_catalogue where model_id=any($1::text[])',
    [config.allowedModels],
  )
  const fetchedAt = latest.rows[0]?.latest ? new Date(latest.rows[0].latest).getTime() : 0
  if (!fetchedAt || Date.now() - fetchedAt > config.catalogueTtlMs) {
    try {
      await refreshCatalogue(pool, config)
    } catch {
      // A stale catalogue is preferable to changing or disabling the reviewed production allowlist.
    }
  }

  for (const model of config.allowedModels) {
    await pool.query(
      `insert into ai_model_allowlist(model_id,enabled,review_status,notes)
       select $1,false,'pending_review','Configured candidate; evaluation required'
       where exists(select 1 from ai_model_catalogue where model_id=$1)
       on conflict(model_id) do nothing`,
      [model],
    )
  }

  const rows = await pool.query(
    `select c.model_id,c.estimated_roadmap_cost,c.context_length,c.supported_parameters,
            c.architecture,c.raw_metadata,coalesce(h.healthy,true) healthy
     from ai_model_catalogue c
     join ai_model_allowlist a on a.model_id=c.model_id
     left join ai_model_health h on h.model_id=c.model_id
     where c.model_id=any($1::text[]) and c.available
       and a.enabled and a.review_status='approved'
     order by c.estimated_roadmap_cost asc nulls last`,
    [config.allowedModels],
  )
  const ranked = rows.rows
    .filter((row) =>
      supportsRoadmap({
        id: row.model_id,
        context_length: row.context_length,
        supported_parameters: row.supported_parameters,
        architecture: row.architecture,
        pricing: row.raw_metadata?.pricing,
      }),
    )
    .filter((row) => row.healthy)
    .filter((row) => {
      const promptPrice = price(row.raw_metadata?.pricing?.prompt)
      const completionPrice = price(row.raw_metadata?.pricing?.completion)
      return (
        (config.maxPromptPricePerToken === null ||
          promptPrice <= config.maxPromptPricePerToken) &&
        (config.maxCompletionPricePerToken === null ||
          completionPrice <= config.maxCompletionPricePerToken)
      )
    })
    .map((row) => ({
      id: row.model_id as string,
      estimatedCost: Number(row.estimated_roadmap_cost),
      supportsReasoning: (row.supported_parameters as string[]).includes('reasoning'),
    }))
    .filter(
      (model) =>
        Number.isFinite(model.estimatedCost) &&
        (config.maxCostUsd === null || model.estimatedCost <= config.maxCostUsd),
    )

  return ranked
}

export async function recordModelHealth(
  pool: Pool,
  modelId: string,
  success: boolean,
  latencyMs: number,
  schemaValid: boolean,
) {
  await pool.query(
    `insert into ai_model_health
     (model_id,healthy,last_successful_call,recent_schema_validity_rate,recent_latency_ms,
      recent_failure_rate,consecutive_failures,updated_at)
     values($1,$2,case when $2 then now() else null end,$3,$4,$5,case when $2 then 0 else 1 end,now())
     on conflict(model_id) do update set
      healthy=case when ai_model_health.consecutive_failures>=2 and not $2 then false else true end,
      last_successful_call=case when $2 then now() else ai_model_health.last_successful_call end,
      recent_schema_validity_rate=(coalesce(ai_model_health.recent_schema_validity_rate,$3)*0.8+$3*0.2),
      recent_latency_ms=round(coalesce(ai_model_health.recent_latency_ms,$4)*0.8+$4*0.2),
      recent_failure_rate=(coalesce(ai_model_health.recent_failure_rate,$5)*0.8+$5*0.2),
      consecutive_failures=case when $2 then 0 else ai_model_health.consecutive_failures+1 end,
      updated_at=now()`,
    [modelId, success, schemaValid ? 1 : 0, latencyMs, success ? 0 : 1],
  )
}
