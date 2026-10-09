export type NspListing = {
  candidateKey: string
  name: string
  deadline: string
  applicationState: 'open' | 'closed'
  applicationMode: 'general' | 'renewal'
  cardHash: string
}

export function extractNspListings(html: string): NspListing[]
export function scholarshipIdForListing(listing: NspListing): string
