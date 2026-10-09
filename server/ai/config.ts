export type AiConfig = {
  apiKey: string
  primaryModel: string
  fallbackModels: string[]
  allowedModels: string[]
  maxInputTokens: number
  maxOutputTokens: number
  maxTotalTokens: number
  reserveTokens: number
  maxCostUsd: number | null
  maxPromptPricePerToken: number | null
  maxCompletionPricePerToken: number | null
  liveDataEnabled: boolean
  catalogueTtlMs: number
  databaseUrl: string
  supabaseUrl: string
  supabaseAnonKey: string
}

const integer = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const list = (value: string | undefined) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export function createAiConfig(env: Record<string, string | undefined>): AiConfig {
  const primaryModel = (env.OPENROUTER_PRIMARY_MODEL || 'mistralai/mistral-small-3.2-24b-instruct').trim()
  const fallbackModels = list(env.OPENROUTER_FALLBACK_MODELS || env.OPENROUTER_FALLBACK_MODEL || 'openai/gpt-4.1-mini').filter(
    (model) => model !== primaryModel,
  )
  const maxInputTokens = Math.min(2800, integer(env.OPENROUTER_MAX_INPUT_TOKENS, 2800))
  const maxOutputTokens = Math.min(1700, integer(env.OPENROUTER_MAX_OUTPUT_TOKENS, 1700))
  const maxTotalTokens = Math.min(9000, integer(env.OPENROUTER_MAX_TOTAL_TOKENS, 9000))
  const maxCost = Number(env.OPENROUTER_MAX_COST_USD_PER_ROADMAP)
  const maxPromptPrice = Number(env.OPENROUTER_MAX_PROMPT_PRICE_PER_TOKEN)
  const maxCompletionPrice = Number(env.OPENROUTER_MAX_COMPLETION_PRICE_PER_TOKEN)

  if (maxInputTokens + maxOutputTokens > maxTotalTokens) {
    throw new Error('OpenRouter token limits exceed the absolute session ceiling')
  }

  return {
    apiKey: env.OPENROUTER_API_KEY || '',
    primaryModel,
    fallbackModels,
    allowedModels: [primaryModel, ...fallbackModels].filter(Boolean),
    maxInputTokens,
    maxOutputTokens,
    maxTotalTokens,
    reserveTokens: Math.max(0, maxTotalTokens - maxInputTokens - maxOutputTokens),
    maxCostUsd: Number.isFinite(maxCost) && maxCost > 0 ? maxCost : null,
    maxPromptPricePerToken:
      Number.isFinite(maxPromptPrice) && maxPromptPrice > 0 ? maxPromptPrice : null,
    maxCompletionPricePerToken:
      Number.isFinite(maxCompletionPrice) && maxCompletionPrice > 0
        ? maxCompletionPrice
        : null,
    liveDataEnabled: env.MANYFOLDS_LIVE_DATA_ENABLED === 'true',
    catalogueTtlMs: 18 * 60 * 60 * 1000,
    databaseUrl: env.DATABASE_URL || '',
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseAnonKey: env.SUPABASE_ANON_KEY || env.PUBLISHABLE_KEY || '',
  }
}
