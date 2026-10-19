export type OfficialSource = { url: string; title: string; excerpt: string }
export type ResearchAnswer = { quote: string; sourceUrl: string }
const clean = (value: string) => value.replace(/\s+/g, ' ').trim()

// The model selects concise answers; every displayed statement must be copied
// from an accepted official citation. Free-form predictions never become facts.
export function groundedResearchAnswers(content: unknown, sources: OfficialSource[]): ResearchAnswer[] {
 if (typeof content !== 'string' || content.length > 20_000) return []
 let payload: { answers?: unknown }
 try { payload = JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) } catch { return [] }
 if (!payload || !Array.isArray(payload.answers)) return []
 const answers: ResearchAnswer[] = [], seen = new Set<string>()
 for (const answer of payload.answers) {
  if (!answer || typeof answer.quote !== 'string' || typeof answer.source_url !== 'string') continue
  const source = sources.find(source => source.url === answer.source_url)
  const quote = clean(answer.quote)
  if (!source || quote.length < 20 || quote.length > 420 || !clean(source.excerpt).includes(quote) || seen.has(quote)) continue
  // Reject instruction text rather than presenting prompt injection as an answer.
  if (/ignore (?:all|previous|your)|system prompt|api.key|send .*password/i.test(quote)) continue
  seen.add(quote); answers.push({ quote, sourceUrl: source.url })
 }
 return answers.slice(0, 3)
}

export function selectionFromQuestion(question: unknown, fallbackCycle: unknown, year = new Date().getUTCFullYear()) {
 if (typeof question !== 'string' || question.trim().length < 8 || question.length > 300) throw new Error('Ask one short question about an exam or admission, for example: When is JEE Main 2027?')
 const text = question.replace(/([a-z])(?=20\d{2}\b)/gi, '$1 ')
 const aliases: Array<[string, RegExp]> = [
  ['jee', /\bjee\b/i], ['neet', /\bneet\b/i], ['cuet', /\bcuet\b/i], ['clat', /\bclat\b/i],
  ['nid', /\bnid\b|\bdat\b|national institute of design/i], ['nift', /\bnift\b/i],
  ['nsp', /\bnsp\b|national scholarship portal/i], ['du', /\bdu\b|delhi university|university of delhi/i],
 ]
 const subjects = aliases.filter(([, pattern]) => pattern.test(text)).map(([id]) => id)
 if (subjects.length !== 1) throw new Error('Name one supported exam or portal, such as JEE Main, NEET UG, CUET UG, CLAT, NID, NIFT, NSP or Delhi University.')
 if ((subjects[0] === 'jee' && /\badvanced\b/i.test(text)) || (['neet', 'cuet'].includes(subjects[0]) && /\bpg\b|post.?graduate/i.test(text))) throw new Error('This lookup currently supports JEE Main, NEET UG and CUET UG. Choose a supported exam below.')
 const years = [...new Set(text.match(/\b20\d{2}\b/g) || [])]
 if (years.length > 1) throw new Error('Ask about one admission or exam year at a time.')
 const cycle = years.length ? Number(years[0]) : /\bthis year\b/i.test(text) ? year : /\bnext year\b/i.test(text) ? year + 1 : Number(fallbackCycle) || year + 1
 const categories = [
  /\bwhen\b|\bdates?\b|deadline|schedule|conducted|registration (?:opens?|closes?)/i.test(text) ? 'dates' : '',
  /eligib|qualify|requirements?|criteria/i.test(text) ? 'eligibility' : '',
  /\bfees?\b|application cost|registration cost/i.test(text) ? 'fees' : '',
 ].filter(Boolean)
 if (categories.length > 1) throw new Error('Ask about dates, eligibility or application fees separately so the answer stays precise.')
 // Only these public choices reach the search provider. The original question,
 // including any accidentally entered personal information, is not forwarded.
 return { subject: subjects[0], topic: categories[0] || 'dates', cycle }
}
