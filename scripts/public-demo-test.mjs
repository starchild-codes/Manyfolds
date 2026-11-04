import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { demoProfiles, initialDemoProfile, demoDirections, sampleRoadmap, initialDemoTasks } from '../src/publicDemoData.ts'

assert.equal(initialDemoProfile(null), 'psychology')
assert.equal(initialDemoProfile('__proto__'), 'psychology')
assert.equal(initialDemoProfile('environment'), 'environment')
const leaders = []
for (const [id, persona] of Object.entries(demoProfiles)) {
  const input = structuredClone(persona.profile)
  const snapshot = JSON.stringify(input)
  const directions = demoDirections(input)
  assert.equal(directions.length, 3, `${id}: three directions should be available`)
  assert.equal(new Set(directions.map(item => item.name)).size, 3)
  assert.equal(JSON.stringify(input), snapshot, 'exploration must not mutate the fictional profile')
  for (const item of directions) {
    assert.ok(item.why.length, `${id}: explain each direction`)
    const stages = sampleRoadmap(item.name)
    assert.equal(stages.length, 4)
    assert.ok(stages.every(stage => stage.title && stage.action && stage.output))
  }
  leaders.push(directions[0].name)
}
assert.equal(new Set(leaders).size, 3, 'distinct fictional profiles should lead to distinct directions')
const changed = structuredClone(demoProfiles.psychology.profile)
changed.subjects = { Mathematics: 'love', Physics: 'love' }
assert.notDeepEqual(demoDirections(changed), demoDirections(demoProfiles.psychology.profile), 'editing interests must affect exploration')
const tasks = initialDemoTasks()
tasks[0].done = true
assert.equal(initialDemoTasks()[0].done, false, 'reset must create a fresh checklist')

// Public walkthroughs must remain independent of accounts, private records and AI spending.
for (const path of ['src/PublicDemo.tsx', 'src/publicDemoData.ts']) {
  const source = await readFile(path, 'utf8')
  assert.doesNotMatch(source, /fetch\s*\(|supabase|localStorage|sessionStorage|openrouter|aiRoadmapApi/i, path)
  assert.doesNotMatch(source, /\uFFFD|\u00c3\u00a2|\u00e2\u0086/, 'no corrupted text encoding')
}
const demo = await readFile('src/PublicDemo.tsx', 'utf8')
assert.match(demo, /not a live AI-generated result/)
assert.match(demo, /Fictional records/)
console.log('Public demo passed: distinct explained results, editable interests, complete samples, fresh resets, no private data or provider calls.')
