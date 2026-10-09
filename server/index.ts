import { createProductionServer } from './production.ts'
const server=createProductionServer(process.env)
const port=Number(process.env.PORT||8080)
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be a valid port number.')
server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Manyfolds production server listening on port ${port}`))
const shutdown=()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref()}
process.once('SIGTERM',shutdown)
process.once('SIGINT',shutdown)
