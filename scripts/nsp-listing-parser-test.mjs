import assert from 'node:assert/strict'
import { extractNspListings, scholarshipIdForListing } from './stage-nsp-scholarships.mjs'

const cards = Array.from({ length: 20 }, (_, index) =>
  `<h6> Scheme ${index} </h6><br><span>Student Application ${index === 0 ? 'Open till (for Renewal)' : index === 1 ? 'Closed on' : 'Open till'} : ${index === 1 ? '30-09-2026' : '31-10-2026'}</span>`,
).join('')
const listings = extractNspListings(`Academic Year 2026-27 <!-- <h6>Fake</h6><br>Student Application Open till : 01-01-2099 -->${cards}`)
assert.equal(listings.length, 20)
assert.equal(listings[0].applicationMode, 'renewal')
assert.equal(listings[0].deadline, '2026-10-31')
assert.equal(listings[1].applicationState, 'closed')
assert.equal(listings[1].deadline, '2026-09-30')
assert.equal(scholarshipIdForListing({ ...listings[0], name: 'AICTE - Swanath Scholarship Scheme ( Technical Degree) (Welfare Based Scheme)' }), 'official-nsp-2026-swanath-degree')
assert.ok(scholarshipIdForListing({ ...listings[0], name: 'AICTE - Swanath Scholarship Scheme (Technical Diploma)' }).startsWith('nsp-2026-27-'))
assert.throws(() => extractNspListings('Academic Year 2025-26' + cards), /academic year/)
assert.throws(() => extractNspListings('Academic Year 2026-27' + cards.slice(0, 30)), /only/)
console.log('NSP staging parser passed')
