import assert from 'node:assert/strict'
import { registryMatches } from '../src/registryFiltering.ts'
import { blankStudentProfile, validateStudentProfile } from '../server/school/profileSchema.ts'
const now = Date.parse('2026-11-04T12:00:00Z')
const student = {id:'fixture',name:'Synthetic student',grade:'12 A',counsellor:'Staff A',stage:'Exploring',priority:'Review next step'}
const details = {id:'fixture',academicYear:'2026-27',stream:'Science',className:'12',section:'A',profileAreas:4,lastSession:'2026-11-01T10:00:00Z',nextFollowUp:'2026-11-06T10:00:00Z',pathways:['Engineering options'],clusters:['Engineering'],plans:['active'],outcomes:['Admission'],consent:['Granted']}
const matching = {academicYear:'2026-27',className:'12',section:'A',staff:'Staff A',stage:'Exploring',pathway:'Engineering options',cluster:'Engineering',stream:'Science',profile:'All four areas recorded',interaction:'Within 30 days',followUp:'Due within 7 days',consent:'Granted',priority:'Flagged',outcome:'Admission',plan:'active'}
for (const [key,value] of Object.entries(matching)) assert.ok(registryMatches(student,details,{[key]:value},now),key)
assert.ok(registryMatches(student,details,matching,now),'combined cohort filters')
for (const key of ['academicYear','className','section','staff','stage','pathway','cluster','stream','consent','outcome','plan']) assert.equal(registryMatches(student,details,{[key]:'Different value'},now),false,key)
for (const [key,value] of Object.entries({profile:'None recorded',interaction:'Never',followUp:'Overdue',consent:'Not recorded',priority:'No flag'})) assert.equal(registryMatches(student,details,{[key]:value},now),false,key)
assert.ok(registryMatches(student,{...details,profileAreas:2,lastSession:null,nextFollowUp:null,consent:[]},{profile:'Some areas recorded',interaction:'Never',followUp:'No open follow-up',consent:'Not recorded'},now))
assert.ok(registryMatches(student,{...details,lastSession:'2026-09-01T10:00:00Z',nextFollowUp:'2026-11-01T10:00:00Z'},{interaction:'Over 30 days ago',followUp:'Overdue'},now))
assert.equal(registryMatches(student,undefined,{consent:'Granted'},now),false,'unloaded details cannot satisfy a filter')
const legacy=blankStudentProfile();delete legacy.consents
assert.deepEqual(validateStudentProfile(legacy).consents,[],'existing profiles remain compatible')
console.log('Registry filters passed: all 15 fields, combined filters, absent data, overdue/no-follow-up and legacy consent compatibility.')
