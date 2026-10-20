import { createHash } from 'node:crypto'

// JSONB and browser objects can have different key orders for identical answers.
export function diagnosticProfileHash(profile: unknown): string {
  const canonical = (value: unknown): unknown => Array.isArray(value)
    ? value.map(canonical)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
      : value
  return createHash('sha256').update(JSON.stringify(canonical(profile))).digest('hex')
}
