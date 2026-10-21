import type {ReportingRow,StaffActivity} from '../server/school/reporting'

export function reportActivity(rows:ReportingRow[]){
 const staff=new Map<string,StaffActivity&{primaryCaseload:number}>(),sessionTypes:Record<string,number>={}
 const entry=(id:string,name:string)=>{
  if(!staff.has(id))staff.set(id,{staffId:id,staffName:name,primaryCaseload:0,completedSessions:0,sessionMinutes:0,scheduledSessions:0,openTasks:0,overdueTasks:0,sessionTypes:{}})
  return staff.get(id)!
 }
 for(const row of rows){
  entry(row.staffId,row.staffName).primaryCaseload++
  for(const activity of row.staffActivity){
   const target=entry(activity.staffId,activity.staffName)
   for(const key of ['completedSessions','sessionMinutes','scheduledSessions','openTasks','overdueTasks'] as const)target[key]+=activity[key]
   for(const [type,count] of Object.entries(activity.sessionTypes))sessionTypes[type]=(sessionTypes[type]||0)+count
  }
 }
 return {staff:[...staff.values()].sort((a,b)=>a.staffName.localeCompare(b.staffName)),sessionTypes}
}
