import type { IncomingMessage,ServerResponse } from 'node:http'
import { createProductionServer } from '../server/production.ts'

// One shared API instance per function process, including its database pool.
let server:ReturnType<typeof createProductionServer>|undefined
export default function handler(req:IncomingMessage,res:ServerResponse){
 const url=new URL(req.url||'/','http://localhost')
 const path=url.searchParams.get('__manyfolds_route')
 if(path!==null){
  if(!/^[a-z0-9/_-]*$/i.test(path)){res.statusCode=400;res.end('Invalid API path');return}
  url.searchParams.delete('__manyfolds_route')
  req.url=`/api/${path}${url.search}`
 }
 if(!req.url?.startsWith('/api/')){res.statusCode=404;res.end('API endpoint not found');return}
 server??=createProductionServer(process.env)
 server.emit('request',req,res)
}
