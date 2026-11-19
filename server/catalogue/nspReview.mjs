export function reviewNspListings(manifest,listings,today){
 const validDate=value=>typeof value==='string'&&/^202[67]-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value
 if(manifest.source!=='https://scholarships.gov.in/All-Scholarships'||manifest.cycle!=='2026-27'||!validDate(manifest.reviewedOn)||!validDate(manifest.reviewAfter)||today<manifest.reviewedOn||today>manifest.reviewAfter)throw Error('NSP manifest needs a fresh source review')
 if(!Array.isArray(manifest.listings)||!manifest.listings.length||new Set(manifest.listings.map(item=>item.name)).size!==manifest.listings.length)throw Error('Reviewed scheme identities must be distinct')
 return manifest.listings.map(expected=>{
  const matches=listings.filter(item=>item.name===expected.name)
  if(matches.length!==1||matches[0].cardHash!==expected.hash||matches[0].deadline!==expected.deadline||!validDate(expected.deadline)||matches[0].applicationState!=='open'||matches[0].applicationMode!=='general'||expected.deadline<today)throw Error(`Source changed or expired: ${expected.name}. Publication refused; review the exact card.`)
  return matches[0]
 })
}
