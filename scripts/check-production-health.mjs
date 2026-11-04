import assert from 'node:assert/strict'
const origin='https://www.manyfolds.in',results=[]
for(const [path,status] of [['/',200],['/auth',200],['/dashboard?view=admissions',200],['/api/health',200],['/api/workspace',401],['/api/students',401],['/api/operations/admissions',401]]){
 const started=Date.now(),res=await fetch(origin+path,{redirect:'error',signal:AbortSignal.timeout(25000)})
 assert.equal(res.status,status,`${path}: unexpected HTTP status`)
 if(path==='/api/health')assert.equal((await res.json()).status,'ready','Database readiness failed')
 else await res.arrayBuffer()
 results.push({path,status:res.status,milliseconds:Date.now()-started})
}
console.log(JSON.stringify({checkedAt:new Date().toISOString(),origin,passed:true,scope:'Public HTTPS availability, database readiness and unauthenticated API denial. Does not replace authenticated browser or inbox tests.',results},null,2))
