import { createHash } from 'node:crypto'
const CYCLE='2026-27'
const digest = (value) => createHash('sha256').update(value).digest('hex')
const clean = (value) => value
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ').trim()
const isoDate = (value) => value ? `${value.slice(6, 10)}-${value.slice(3, 5)}-${value.slice(0, 2)}` : null

export function scholarshipIdForListing(listing) {
  const name = listing.name.toLowerCase()
  if (name.includes('aicte - swanath') && name.includes('technical degree')) return 'official-nsp-2026-swanath-degree'
  if (name.includes('aicte - pragati') && name.includes('technical degree')) return 'official-nsp-2026-pragati-degree'
  if (name.includes('aicte - saksham') && name.includes('technical degree')) return 'official-nsp-2026-saksham-degree'
  if (name.includes('top class education for sc students')) return 'official-nsp-2026-top-class-sc'
  return `nsp-${CYCLE}-${listing.candidateKey.split(':').at(-1)}`
}

export function extractNspListings(html) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '')
  if (!withoutComments.includes(`Academic Year ${CYCLE}`)) throw new Error(`NSP page does not identify academic year ${CYCLE}`)
  const cards = [...withoutComments.matchAll(/<h6>\s*([^<]+)<\/h6><br>([\s\S]*?)(?=<h6>|$)/g)]
  const listings = []
  for (const card of cards) {
    const name = clean(card[1])
    const body = clean(card[2])
    const window = body.match(/Student Application\s+(Open till|Closed on)\s*(\(for Renewal\))?\s*:\s*(\d{2}-\d{2}-\d{4})/i)
    if (!name || !window) continue
    const deadline = isoDate(window[3])
    const mode = window[2] ? 'renewal' : 'general'
    const cardText = `${name}|${deadline}|${window[1].toLowerCase()}|${mode}`
    listings.push({
      candidateKey: `nsp:${CYCLE}:${digest(name.toLowerCase()).slice(0, 16)}`,
      name,
      deadline,
      applicationState: window[1].toLowerCase() === 'closed on' ? 'closed' : 'open',
      applicationMode: mode,
      cardHash: digest(cardText),
    })
  }
  if (listings.length < 20) throw new Error(`NSP parser found only ${listings.length} listings; review page structure`)
  return listings
}
