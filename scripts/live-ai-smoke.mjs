// Opt-in smoke check of the configured providers with fictional evidence only.
// It does not change student records, model selection, approvals or prompts.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { loadEnv } from 'vite'
import { createAiConfig } from '../server/ai/config.ts'
import { callOpenRouter } from '../server/ai/openrouter.ts'
import { makeEvaluationItems, parseAndValidateRoadmap } from './roadmap-evaluation-lib.mjs'
const config = createAiConfig({...loadEnv('development', process.cwd(), ''), ...process.env})
const fixtures = JSON.parse(await readFile('scripts/fixtures/roadmap-evaluation-profiles.json', 'utf8'))
const item = makeEvaluationItems(fixtures, config).find(row => row.fixture.id === 'class12-pcm-engineering')
assert.ok(item, 'Synthetic smoke profile is required')
const response = await fetch('https://openrouter.ai/api/v1/models', {signal:AbortSignal.timeout(20000)})
assert.ok(response.ok, 'Provider catalogue must be available')
const catalogue = (await response.json()).data
const requestedModel = process.argv.find(value => value.startsWith('--model='))?.slice(8)
if (requestedModel) assert.ok(config.allowedModels.includes(requestedModel), 'Use an already configured model')
const models = [config.primaryModel, ...config.fallbackModels].slice(0, 2).filter(id => !requestedModel || id === requestedModel).map(id => {
  const model = catalogue.find(row => row.id === id)
  assert.ok(model, `Configured model missing: ${id}`)
  const cost = Number(model.pricing.prompt) * config.maxInputTokens + Number(model.pricing.completion) * config.maxOutputTokens + Number(model.pricing.request || 0)
  assert.ok(Number.isFinite(cost) && cost >= 0, 'A current price is required')
  return {id, cost, reasoning:(model.supported_parameters || []).includes('reasoning')}
})
assert.ok(models.reduce((sum, model) => sum + model.cost, 0) <= 0.02, 'Smoke calls must stay below USD 0.02 in total')
if (!process.argv.includes('--run')) {
  console.log('Provider preflight passed. Use --run for at most two fictional smoke calls; total price cap USD 0.02.')
} else {
  const results = []
  await mkdir('output/qa', {recursive:true})
  for (const model of models) {
    try {
      const generated = await callOpenRouter(config, model.id, item.evidence, config.maxOutputTokens, model.reasoning)
      await writeFile(`output/qa/live-ai-output-${model.id.replace(/[^a-z0-9-]/gi, '-')}.json`, JSON.stringify(generated.rawRoadmap, null, 2))
      const validation = parseAndValidateRoadmap(generated.rawRoadmap, item.evidence, true)
      results.push({model:model.id, passed:Boolean(validation.schemaValid && validation.factualValid), schemaValid:validation.schemaValid,
        factualValid:validation.factualValid, errors:validation.errors, tokens:generated.usage.totalTokens, latencyMs:generated.latencyMs})
    } catch (error) { results.push({model:model.id, passed:false, error:error.message}) }
  }
  let previous = null
  try { previous = JSON.parse(await readFile('output/qa/live-ai-verification.json', 'utf8')) } catch { /* First run. */ }
  const previousAttempts = previous ? [...(previous.previousAttempts || []), {checkedAt:previous.checkedAt, scope:previous.scope, results:previous.results}] : []
  const providerPathAvailable = results.some(result => result.passed)
  await writeFile('output/qa/live-ai-verification.json', JSON.stringify({checkedAt:new Date().toISOString(), scope:'Production provider client and generation validator, fictional sparse evidence only; no real student records or model approvals changed.', providerPathAvailable, previousAttempts, results}, null, 2))
  console.log(JSON.stringify({providerPathAvailable, results}))
  // The production service can fall back after rejecting an unsafe primary output.
  // Keep each rejected provider result visible even when a valid fallback exists.
  if (!providerPathAvailable) process.exitCode = 1
}
