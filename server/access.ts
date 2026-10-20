import type { Pool, PoolClient } from 'pg'
import type { AuthContext } from './ai/types.ts'
import {readDatabase} from './database.ts'

export const schoolRoles = ['owner','admin','lead_counsellor','counsellor','guidance_teacher','teacher','data_entry','reviewer','viewer'] as const
export const guidanceRoles = ['owner','admin','lead_counsellor','counsellor','guidance_teacher']
export const counsellingRoles = ['owner','admin','lead_counsellor','counsellor']
export const assignmentRoles = ['owner','admin','lead_counsellor']
export const rosterRoles = [...guidanceRoles,'data_entry']
export const canGuide = (role:string) => guidanceRoles.includes(role)
export const canCounsel = (role:string) => counsellingRoles.includes(role)
export class AccessError extends Error {
 readonly statusCode:number
 constructor(message='This student is not in your authorised caseload.',statusCode=404){super(message);this.statusCode=statusCode}
}
export async function assertStudentAccess(db:Pool|PoolClient,auth:AuthContext,key:string) {
 if(!key)throw new AccessError('Choose a student.',400)
 const result=await readDatabase(db,'select public.school_can_access_student($1,$2,$3) allowed',[auth.organisationId,key,auth.userId])
 if(!result.rows[0]?.allowed)throw new AccessError()
}
export async function studentKeys(db:Pool|PoolClient,auth:AuthContext) {
 const result=await db.query('select external_key from student_registry_records where organisation_id=$1 and public.school_can_access_student(organisation_id,external_key,$2)',[auth.organisationId,auth.userId])
 return result.rows.map(row=>String(row.external_key))
}
// Least-privilege entry gates supplement per-record checks. Limited roles never
// enter endpoints that return counselling details, even for assigned students.
export function assertAreaAccess(auth:AuthContext,area:string,path:string,method:string) {
 if(['owner','admin','lead_counsellor','counsellor','guidance_teacher'].includes(auth.role))return
 if(['catalogue','workspace'].includes(area))return
 if(area==='operations'&&path==='/saved-paths')return
 if(area==='students'&&auth.role!=='reviewer'&&auth.role!=='viewer')return
 if(area==='operations'&&path==='/analytics'&&method==='GET'&&['reviewer','viewer'].includes(auth.role))return
 if(area==='operations'&&path==='/observations'&&auth.role==='teacher')return
 if(area==='operations'&&(['/academics','/classes','/staff-directory','/export-log'].includes(path)||path==='/imports'||path.startsWith('/imports/'))&&auth.role==='data_entry')return
 if(area==='guidance'&&path==='/'&&method==='GET'&&auth.role==='teacher')return
 throw new AccessError('Your role does not have access to this area.',403)
}
