import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { loadEnv } from 'vite'
const directory=await mkdtemp(join(tmpdir(),'manyfolds-production-'))
const run=(command,args,env)=>new Promise((resolveRun,reject)=>{
 const windowsNpm=process.platform==='win32'&&command==='npm'
 const child=spawn(windowsNpm?'cmd.exe':command,windowsNpm?['/d','/s','/c','npm ci --omit=dev --ignore-scripts']:args,{cwd:directory,env,stdio:['ignore','pipe','pipe']})
 let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk)
 child.on('error',reject);child.on('exit',code=>code===0?resolveRun(output):reject(new Error(`Production package command failed (${code}): ${output}`)))
})
try{
 for(const file of ['package.json','package-lock.json','server','dist'])await cp(file,join(directory,file),{recursive:true})
 await run('npm',['ci','--omit=dev','--ignore-scripts'],process.env)
 const env={...loadEnv('development',process.cwd(),''),...process.env}
 const source=`import assert from 'node:assert/strict';import {createProductionServer} from './server/production.ts';import {existsSync} from 'node:fs';assert.equal(existsSync('node_modules/vite'),false);const server=createProductionServer(process.env);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{const base='http://127.0.0.1:'+server.address().port;assert.equal((await fetch(base+'/dashboard')).status,200);assert.equal((await fetch(base+'/api/school/staff')).status,401);assert.equal((await fetch(base+'/api/knowledge?type=Course')).status,200)}finally{await new Promise(resolve=>server.close(resolve))}console.log('Production-only package started and served UI/APIs without Vite or development dependencies.');`
 const output=await run(process.execPath,['--input-type=module','--eval',source],env)
 assert.match(output,/without Vite/);console.log(output.trim())
}finally{
 // Verify the generated directory stays directly inside the operating system temp root.
 if(dirname(resolve(directory))===resolve(tmpdir())&&basename(directory).startsWith('manyfolds-production-'))await rm(directory,{recursive:true,force:true})
 else console.error('Unexpected production test directory; cleanup skipped.')
}
