import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
const checks = ['test','test:journey','test:students','test:school','test:operations','test:guidance','test:saved-pathways','test:roadmap-review','test:roadmap-generation','test:model-refresh','test:research','test:roadmap-evidence','test:verification-workspace','test:evaluation-persistence','test:scholarship-parser','test:rls','test:production','test:vercel','test:production-package']
await mkdir('output/qa',{recursive:true})
const results = []
for (const name of checks) {
 const started=Date.now()
 console.log(`Checking ${name}`)
 const result=await new Promise(resolve=>{
  const child=process.platform==='win32'?spawn('cmd.exe',['/d','/s','/c',`npm run ${name}`],{windowsHide:true}):spawn('npm',['run',name])
  let output='',timedOut=false
  const timer=setTimeout(()=>{timedOut=true;child.kill()},180_000)
  child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk)
  child.on('error',error=>{clearTimeout(timer);resolve({name,passed:false,output:error.message})})
  child.on('exit',code=>{clearTimeout(timer);resolve({name,passed:code===0&&!timedOut,exitCode:code,timedOut,milliseconds:Date.now()-started,output})})
 })
 results.push(result)
 console.log(`${result.passed?'PASS':'FAIL'} ${name}${result.passed?'':`\n${result.output.slice(-1800)}`}`)
 await writeFile('output/qa/release-sweep.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2))
}
const failed=results.filter(result=>!result.passed)
console.log(`${results.length-failed.length}/${results.length} checks passed. Detailed results: output/qa/release-sweep.json`)
if(failed.length)process.exitCode=1
