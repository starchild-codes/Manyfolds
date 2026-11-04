export type OfficialSource = { url: string; title: string; excerpt: string }
export type ResearchAnswer = { quote: string; sourceUrl: string }
const clean = (value: string) => value.replace(/\s+/g, ' ').trim()

export function feeSourceNeedsReview(url:URL,topic:string){
 // Reviewed 28 October: this mixed-cycle page has contradictory application-fee
 // numerals/words and a 2026-27 tuition table. A newer exact notice is required.
 return ['fees','programme_fees'].includes(topic)&&['nls.ac.in','www.nls.ac.in'].includes(url.hostname)&&url.pathname.replace(/\/$/,'')==='/programme/b-a-hons'
}
export function programmeFeeAnswerForCycle(answer:ResearchAnswer,cycle:number){
 if(!/fee|tuition|hostel/i.test(answer.quote)||!new RegExp(`\\b${cycle}\\b`).test(answer.quote))return false
 const labels=[...answer.quote.matchAll(/\b(?:AY|academic\s+year|session)\s*[:|\-]?\s*(20\d{2})\s*[-/–]\s*\d{2,4}/gi)]
 return labels.every(label=>Number(label[1])===cycle)
}

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
  ['jee', /\bjee\b(?!\s*(?:advanced|\(advanced\)))/i], ['jee_advanced', /\bjee\s*(?:advanced|\(advanced\))/i], ['neet', /\bneet\b/i], ['cuet', /\bcuet\b/i], ['clat', /\bclat\b/i],
  ['nid', /\bnid\b|\bdat\b|national institute of design/i], ['nift', /\bnift\b/i],
  ['nsp', /\bnsp\b|national scholarship portal/i], ['du', /\bdu\b|delhi university|university of delhi/i],
  ['josaa', /\bjosaa\b/i], ['mcc', /\bmcc\b|medical counselling committee/i], ['iiser', /\biiser\b|\biat\b/i], ['nest', /\bnest\b/i], ['nata', /\bnata\b/i], ['nlsiu', /\bnlsiu\b|\bnlsat\b|national law school of india/i],
 ]
 const subjects = aliases.filter(([, pattern]) => pattern.test(text)).map(([id]) => id)
 if (subjects.length !== 1) throw new Error('Name one supported exam or portal, such as JEE Main, NEET UG, CUET UG, CLAT, NID, NIFT, NSP or Delhi University.')
 if (['neet', 'cuet'].includes(subjects[0]) && /\bpg\b|post.?graduate/i.test(text)) throw new Error('This lookup currently supports NEET UG and CUET UG. Choose a supported exam below.')
 const years = [...new Set(text.match(/\b20\d{2}\b/g) || [])]
 if (years.length > 1) throw new Error('Ask about one admission or exam year at a time.')
 const cycle = years.length ? Number(years[0]) : /\bthis year\b/i.test(text) ? year : /\bnext year\b/i.test(text) ? year + 1 : Number(fallbackCycle) || year + 1
 const programmeFees=/tuition|hostel|programme fees?|program fees?|course fees?/i.test(text)
 const categories = [
  /\bwhen\b|\bdates?\b|deadline|schedule|conducted|registration (?:opens?|closes?)/i.test(text) ? 'dates' : '',
  /eligib|qualify|requirements?|criteria/i.test(text) ? 'eligibility' : '',
  !programmeFees&&/\bfees?\b|application cost|registration cost/i.test(text) ? 'fees' : '',
  programmeFees?'programme_fees':'',
 ].filter(Boolean)
 if (categories.length > 1) throw new Error('Ask about dates, eligibility or application fees separately so the answer stays precise.')
 // Only these public choices reach the search provider. The original question,
 // including any accidentally entered personal information, is not forwarded.
 return { subject: subjects[0], topic: categories[0] || 'dates', cycle }
}
