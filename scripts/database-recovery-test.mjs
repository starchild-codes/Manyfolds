import assert from 'node:assert/strict'
import { checkedDatabaseClient, readDatabase } from '../server/database.ts'
const reset = () => Object.assign(new Error('connection reset'), {code:'ECONNRESET'})
let disposed = false, acquired = 0, queries = []
const healthy = {query:async sql=>{queries.push(sql);return {rows:[{ready:true}]}},release:()=>{}}
const stale = {query:async()=>{throw reset()},release:destroy=>{disposed=destroy}}
const recovered = await checkedDatabaseClient({connect:async()=>++acquired===1?stale:healthy})
assert.equal(recovered,healthy);assert.equal(disposed,true,'discard broken connection')
assert.deepEqual(queries,['select 1'],'only connection preflight is retried, never application writes')
let reads=0
const result=await readDatabase({query:async(sql,params)=>{assert.equal(sql,'select example');assert.deepEqual(params,['value']);if(++reads===1)throw reset();return {rows:[{ok:true}]}}},'select example',['value'])
assert.equal(result.rows[0].ok,true)
let permanentAttempts=0
await assert.rejects(readDatabase({query:async()=>{permanentAttempts++;throw Object.assign(Error('invalid query'),{code:'42601'})}},'invalid'),/invalid query/)
assert.equal(permanentAttempts,1,'do not retry permanent SQL errors')
let outageAttempts=0
await assert.rejects(readDatabase({query:async()=>{outageAttempts++;throw reset()}},'select example'),/connection reset/)
assert.equal(outageAttempts,2,'outage retry is bounded')
console.log('Database recovery passed: stale connection disposal, bounded reads, preserved parameters, no permanent-error or application-write replay.')
