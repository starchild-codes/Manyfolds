import type { EventEmitter } from 'node:events'
import { Pool, type PoolClient } from 'pg'

const connectionFailure=(error:unknown)=>['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE'].includes((error as {code?:string}).code||'')||/connection terminated|timeout/i.test(error instanceof Error?error.message:'')
// Only retry acquiring/checking a connection, before any transaction or write starts.
export async function checkedDatabaseClient(pool:Pool):Promise<PoolClient>{
 for(let attempt=0;attempt<2;attempt++){
  let client:PoolClient|undefined
  try{client=await pool.connect();await client.query('select 1');return client}
  catch(error){client?.release(true);if(attempt||!connectionFailure(error))throw error}
 }
 throw new Error('Database connection unavailable.')
}
export async function readDatabase(pool:Pool,sql:string,values:unknown[]=[]){
 try{return await pool.query(sql,values)}catch(error){if(!connectionFailure(error))throw error;return pool.query(sql,values)}
}

// Every API in a server process shares these connections.
const pools=new Map<string,Pool>()
const owners=new WeakMap<Pool,Set<EventEmitter>>()
export function getDatabasePool(databaseUrl:string):Pool{
  const existing=pools.get(databaseUrl)
  if(existing)return existing
  const pool=new Pool({connectionString:databaseUrl,ssl:{rejectUnauthorized:false},max:3,connectionTimeoutMillis:10_000,idleTimeoutMillis:60_000,keepAlive:true,keepAliveInitialDelayMillis:10_000,query_timeout:20_000,allowExitOnIdle:true})
  pool.on('error',()=>console.error('An idle database connection was closed; the pool will replace it.'))
  pools.set(databaseUrl,pool)
  return pool
}
export function attachDatabasePool(pool:Pool,server:EventEmitter|null){
  if(!server)return
  let servers=owners.get(pool)
  if(!servers){servers=new Set();owners.set(pool,servers)}
  if(servers.has(server))return
  servers.add(server)
  server.once('close',()=>{
    servers.delete(server)
    if(servers.size)return
    for(const [url,current] of pools)if(current===pool)pools.delete(url)
    void pool.end().catch(()=>undefined)
  })
}
