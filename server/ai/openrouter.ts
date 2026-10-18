import type { AiConfig } from './config.ts'
import { ROADMAP_SYSTEM_PROMPT } from './prompt.ts'
import { roadmapResponseSchema } from './schema.ts'
import type { GenerationUsage, RoadmapEvidencePackage } from './types.ts'

export class OpenRouterError extends Error {
  readonly retryable: boolean
  readonly statusCode: number | null
  constructor(message: string, retryable = false, statusCode: number | null = null) {
    super(message)
    this.name = 'OpenRouterError'
    this.retryable = retryable
    this.statusCode = statusCode
  }
}

type OpenRouterResponse = {
  model?: string
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    cost?: number
    completion_tokens_details?: { reasoning_tokens?: number }
    reasoning_tokens?: number
  }
}

type ResponseContent = string | Array<{ type?: string; text?: string }> | undefined

const contentText = (content: ResponseContent) => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((part) => part.text || '').join('')
  return ''
}

export async function callOpenRouter(
  config: AiConfig,
  model: string,
  evidence: RoadmapEvidencePackage,
  maxOutputTokens: number,
  supportsReasoning = false,
  correction = false,
  timeoutMs = 45_000,
): Promise<{
  rawRoadmap: unknown
  usage: GenerationUsage
  modelUsed: string
  latencyMs: number
}> {
  if (!config.apiKey) {
    throw new OpenRouterError('AI roadmap generation is not configured on this server.')
  }
  const started = Date.now()
  let response: Response
  try {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: ROADMAP_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(evidence) },
        ...(correction ? [{ role: 'user', content: 'Your previous response failed validation. Return only JSON matching the supplied schema and evidence. Omit unsupported facts and reflect every hard constraint.' }] : []),
      ],
      temperature: 0.1,
      max_tokens: maxOutputTokens,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'manyfolds_roadmap',
          strict: true,
          schema: roadmapResponseSchema(evidence.verified_relationships.length > 0),
        },
      },
      provider: { require_parameters: true, allow_fallbacks: false },
    }
    if (supportsReasoning) body.reasoning = { exclude: true }
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://manyfolds.app',
        'X-Title': 'Manyfolds',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1, Math.min(45_000, timeoutMs))),
    })
  } catch {
    throw new OpenRouterError(
      'We could not generate the roadmap right now. Your saved profile and recommendations are unchanged.',
      true,
    )
  }
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500
    throw new OpenRouterError(
      response.status === 402
        ? 'AI roadmap generation is temporarily unavailable because the provider account needs attention.'
        : 'We could not generate the roadmap right now. Your saved profile and recommendations are unchanged.',
      retryable,
      response.status,
    )
  }

  let payload: OpenRouterResponse
  try {
    payload = (await response.json()) as OpenRouterResponse
  } catch {
    throw new OpenRouterError('The roadmap provider returned an invalid response.', true)
  }
  const rawText = contentText(payload.choices?.[0]?.message?.content)
  if (!rawText) throw new OpenRouterError('The roadmap provider returned an empty response.', true)
  let rawRoadmap: unknown
  try {
    rawRoadmap = JSON.parse(rawText)
  } catch {
    throw new OpenRouterError('The roadmap provider returned an invalid structured response.', true)
  }

  const inputTokens = payload.usage?.prompt_tokens || 0
  const outputTokens = payload.usage?.completion_tokens || 0
  const reasoningTokens =
    payload.usage?.completion_tokens_details?.reasoning_tokens ||
    payload.usage?.reasoning_tokens ||
    0
  const computedTotal = inputTokens + outputTokens + reasoningTokens
  const totalTokens = Math.max(payload.usage?.total_tokens || 0, computedTotal)
  return {
    rawRoadmap,
    usage: {
      inputTokens,
      outputTokens,
      reasoningTokens,
      totalTokens,
      reportedCost:
        typeof payload.usage?.cost === 'number' ? payload.usage.cost : null,
    },
    modelUsed: payload.model || model,
    latencyMs: Date.now() - started,
  }
}
