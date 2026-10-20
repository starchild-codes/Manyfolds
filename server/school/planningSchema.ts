export type PlanningKind='pathway'|'plan'|'outcome'
export type PlanningRecord={title:string;status:string;[key:string]:unknown}
export class PlanningError extends Error {readonly statusCode:number;constructor(message:string,statusCode=400){super(message);this.statusCode=statusCode}}
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new PlanningError('Provide a planning record.');return value as Record<string,unknown>}
const text=(value:unknown,label:string,max=3000,required=false)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim())throw new PlanningError(`${label} is missing or too long.`);return value.trim()}
const date=(value:unknown,label:string,required=false)=>{const v=text(value??'',label,10,required);if(v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))throw new PlanningError(`${label} must be a valid date.`);return v}
const choice=(value:unknown,options:string[],label:string)=>{if(typeof value!=='string'||!options.includes(value))throw new PlanningError(`Choose a valid ${label}.`);return value}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export const pathwayFields=[['career','Career or field'],['course','Intended course'],['institutions','Potential institutions or institution types'],['subjects','School-subject requirements to check'],['exams','Entrance examinations to check'],['eligibility','Eligibility considerations'],['duration','Preferred duration'],['cost','Cost considerations'],['scholarships','Scholarships to explore'],['location','Location'],['timeline','Timeline'],['risks','Risks'],['assumptions','Assumptions'],['informationNeeded','Information still needed'],['nextSteps','Next steps']] as const
export const outcomeTypes=['Course application','Admission','Scholarship','Diploma','Apprenticeship','Employment','Further exploration','Other']
export function validatePlanning(kind:PlanningKind,value:unknown):PlanningRecord{
 const input=object(value),result:PlanningRecord={title:text(input.title,'Title',200,true),status:choice(input.status,kind==='outcome'?['reported','verified','archived']:['draft','active','paused','completed','archived'],'status')}
 result.shareableSummary=text(input.shareableSummary??'','Student or guardian summary',5000)
 result.summaryApproved=input.summaryApproved===true
 if(result.summaryApproved&&!result.shareableSummary)throw new PlanningError('Write a separate summary before approving it for sharing.')
 if(kind==='pathway'){
  result.category=choice(input.category,['primary','alternative','exploratory'],'pathway type')
  for(const [key,label] of pathwayFields)result[key]=text(input[key]??'',label)
  if(!result.career)throw new PlanningError('Record a career or field for this pathway.')
  result.confidence=choice(input.confidence,['Not assessed','Low','Moderate','High'],'counsellor confidence')
  result.interest=choice(input.interest,['Not discussed','Low','Moderate','High'],'reported student interest')
  result.reviewDate=date(input.reviewDate,'Review date')
 }
 if(kind==='plan'){
  result.goal=text(input.goal,'Goal',3000,true);result.startDate=date(input.startDate,'Start date',true);result.targetDate=date(input.targetDate,'Target date',true)
  if(String(result.targetDate)<String(result.startDate))throw new PlanningError('Target date cannot precede the start date.')
  if(!uuid(input.ownerId))throw new PlanningError('Choose an active staff owner.');result.ownerId=input.ownerId
  result.notes=text(input.notes??'','Plan notes',5000);result.completionSummary=text(input.completionSummary??'','Completion summary',3000)
  if(!Array.isArray(input.reviewDates)||input.reviewDates.length>50)throw new PlanningError('Use at most 50 review dates.');result.reviewDates=[...new Set(input.reviewDates.map(v=>date(v,'Review date',true)))].sort()
  if(!Array.isArray(input.taskIds)||input.taskIds.length>100||input.taskIds.some(v=>!uuid(v)))throw new PlanningError('Choose valid student-linked tasks.');result.taskIds=[...new Set(input.taskIds)]
  if(!Array.isArray(input.milestones)||input.milestones.length>100)throw new PlanningError('Use at most 100 milestones.')
  const ids=new Set<string>();const milestones=input.milestones.map(v=>{const row=object(v);if(!uuid(row.id)||ids.has(row.id))throw new PlanningError('Each milestone needs a unique ID.');ids.add(row.id);if(!Array.isArray(row.dependsOn)||row.dependsOn.some(v=>!uuid(v))||row.dependsOn.length>100)throw new PlanningError('Choose valid milestone dependencies.');return{id:row.id,title:text(row.title,'Milestone title',200,true),targetDate:date(row.targetDate,'Milestone date',true),status:choice(row.status,['open','completed','cancelled'],'milestone status'),dependsOn:[...new Set(row.dependsOn)] as string[],evidence:text(row.evidence??'','Completion evidence',3000)}})
  const map=new Map(milestones.map(m=>[m.id,m])),visiting=new Set(),visited=new Set()
  const visit=(id:string)=>{if(visiting.has(id))throw new PlanningError('Milestone dependencies cannot form a cycle.');if(visited.has(id))return;const row=map.get(id);if(!row)throw new PlanningError('A dependency refers to a missing milestone.');visiting.add(id);for(const dep of row.dependsOn)visit(dep);visiting.delete(id);visited.add(id)}
  for(const m of milestones){visit(m.id);if(m.targetDate<String(result.startDate)||m.targetDate>String(result.targetDate))throw new PlanningError('Milestone dates must fall within the plan.');if(m.status==='completed'&&(!m.evidence||m.dependsOn.some(id=>map.get(id)?.status!=='completed')))throw new PlanningError('Complete prerequisites and record evidence before completing a milestone.')}
  result.milestones=milestones
  if(result.status==='completed'&&(!result.completionSummary||milestones.some(m=>!['completed','cancelled'].includes(m.status))))throw new PlanningError('Complete milestones and write a completion summary before closing the plan.')
 }
 if(kind==='outcome'){
  result.type=choice(input.type,outcomeTypes,'outcome type');result.date=date(input.date,'Outcome date',true)
  for(const key of ['provider','programme','reportedBy','evidence','sourceUrl','documentId','notes'])result[key]=text(input[key]??'',key,key==='notes'?5000:3000,key==='reportedBy')
  if(result.sourceUrl){let url:URL;try{url=new URL(String(result.sourceUrl))}catch{throw new PlanningError('Use an HTTPS evidence URL.')}if(url.protocol!=='https:'||url.username||url.password)throw new PlanningError('Use an HTTPS evidence URL without credentials.')}
  if(result.documentId&&!uuid(result.documentId))throw new PlanningError('Choose a saved document.')
  result.confidence=choice(input.confidence,['Reported only','Document checked','Official source checked'],'evidence confidence')
  if(result.status==='verified'&&(!result.evidence||!result.documentId&&!result.sourceUrl||result.confidence==='Reported only'))throw new PlanningError('Verification requires evidence notes and a checked official source or student document.')
 }
 return result
}
