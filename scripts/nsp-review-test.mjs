import assert from 'node:assert/strict'
import {readFile}from'node:fs/promises'
import {reviewNspListings}from'../server/catalogue/nspReview.mjs'
const m=JSON.parse(await readFile('data/verified/nsp-listings-2026.json','utf8'))
const cards=m.listings.map(item=>({...item,cardHash:item.hash,applicationState:'open',applicationMode:'general'}))
assert.equal(reviewNspListings(m,cards,'2026-11-19').length,10)
for(const change of [{deadline:'2026-12-31'},{cardHash:'changed'},{applicationState:'closed'},{applicationMode:'renewal'}]){
 const modified=structuredClone(cards);Object.assign(modified[0],change)
 assert.throws(()=>reviewNspListings(m,modified,'2026-11-19'),/Source changed or expired/)
}
assert.throws(()=>reviewNspListings(m,[...cards,cards[0]],'2026-11-19'),/Source changed or expired/)
assert.throws(()=>reviewNspListings(m,cards,'2026-12-01'),/fresh source review/)
assert.throws(()=>reviewNspListings({...m,source:'https://example.com'},cards,'2026-11-19'),/fresh source review/)
const bad=structuredClone(m);bad.listings[0].deadline='2026-02-31';const matching=structuredClone(cards);matching[0].deadline='2026-02-31'
assert.throws(()=>reviewNspListings(bad,matching,'2026-11-19'),/Source changed or expired/)
console.log('Reviewed NSP publication checks passed: exact cards, explicit dates, general application scope, duplicate/expiry/redirect guards.')
