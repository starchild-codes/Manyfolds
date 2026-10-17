import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
let project
try{project=JSON.parse(await readFile('.vercel/project.json','utf8'))}catch{throw Error('Sign in with vercel login, then run vercel link --project manyfolds --yes.')}
if(project.projectName?.toLowerCase()!=='manyfolds')throw Error('Deployment blocked: link this repository to the manyfolds project first.')
const child=process.platform==='win32'?spawn('cmd.exe',['/d','/s','/c','vercel deploy --prod --yes'],{stdio:'inherit',windowsHide:true}):spawn('vercel',['deploy','--prod','--yes'],{stdio:'inherit'})
child.once('error',()=>{console.error('Vercel could not be started.');process.exitCode=1})
child.once('exit',code=>{process.exitCode=code??1})
