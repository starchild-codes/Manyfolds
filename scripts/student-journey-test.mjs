import assert from 'node:assert/strict'
import { studentWorkflowUrl, followStudentWorkflow, diagnosticGrade } from '../src/studentWorkflowNavigation.ts'
assert.equal(diagnosticGrade('11 B'),'Class 11');assert.equal(diagnosticGrade('Class 12 A'),'Class 12');assert.equal(diagnosticGrade('10A'),'Class 10');assert.equal(diagnosticGrade('18 A'),'');assert.equal(diagnosticGrade('Unassigned'),'')
const key='student-with & reserved? characters',career='Psychology & computing'
const url=new URL(studentWorkflowUrl('roadmap',key,career),'https://manyfolds.vercel.app')
assert.equal(url.pathname,'/dashboard');assert.equal(url.searchParams.get('student'),key);assert.equal(url.searchParams.get('career'),career);assert.equal(url.searchParams.get('view'),'roadmap')
assert.equal(new URL(studentWorkflowUrl('diagnostic',key,career),url).searchParams.has('career'),false)
const original=globalThis.window,target=new EventTarget()
globalThis.window=target
try{
 let accepted=0,prevented=0
 target.addEventListener('manyfolds-student-workflow',event=>{assert.deepEqual(event.detail,{view:'roadmap',studentKey:key,career});accepted++;event.preventDefault()})
 const click={button:0,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,preventDefault:()=>prevented++}
 followStudentWorkflow(click,'roadmap',key,career)
 assert.equal(accepted,1);assert.equal(prevented,1,'Handled or blocked in-app navigation must not fall back to a full reload')
 followStudentWorkflow({...click,ctrlKey:true},'roadmap',key,career)
 assert.equal(accepted,1);assert.equal(prevented,1,'Modified clicks must retain normal browser behavior')
}finally{globalThis.window=original}
console.log('Student journey navigation passed: selected student/career survive URLs, safe encoding, in-app navigation guards and normal modified links.')
