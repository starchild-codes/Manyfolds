import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
const checks = ['test','test:onboarding','test:staff-access','test:planning','test:sharing','test:pipeline','test:leadership-notes','test:tasks-calendar','test:email','test:platform','test:journey','test:students','test:school','test:operations','test:guidance','test:saved-pathways','test:roadmap-review','test:roadmap-generation','test:model-refresh','test:research','test:roadmap-evidence','test:verification-workspace','test:evaluation-persistence','test:scholarship-parser','test:rls','test:production','test:vercel','test:production-package']
await mkdir('output/qa',{recursive:true})
const rerunFailed=process.argv.includes('--rerun-failed')
const previous=rerunFailed?JSON.parse(await readFile('output/qa/release-sweep.json','utf8')):null
const results=previous?.results||[]
const selected=rerunFailed?checks.filter(name=>results.some(r=>r.name===name&&!r.passed)):checks
if(rerunFailed&&!selected.length)throw Error('The previous sweep has no failed checks to rerun.')
for (const name of selected) {
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
 result.checkedAt=new Date().toISOString()
 const old=results.findIndex(r=>r.name===name)
 if(old>=0){result.previousAttempts=[...(results[old].previousAttempts||[]),{...results[old],previousAttempts:undefined}];results[old]=result}else results.push(result)
 console.log(`${result.passed?'PASS':'FAIL'} ${name}${result.passed?'':`\n${result.output.slice(-1800)}`}`)
 await writeFile('output/qa/release-sweep.json',JSON.stringify({checkedAt:new Date().toISOString(),mode:rerunFailed?'failed-check-rerun':'full-sweep',results},null,2))
}
const failed=results.filter(result=>!result.passed)
console.log(`${results.length-failed.length}/${results.length} checks passed. Detailed results: output/qa/release-sweep.json`)
if(failed.length)process.exitCode=1
