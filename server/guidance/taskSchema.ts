export const responsibleParties=['Counsellor','Guidance teacher','Student (offline follow-up)','Guardian (offline follow-up)','School administrator','External contact']
export const taskCategories=['Research','Document collection','Examination registration','Scholarship application','Course exploration','Institution comparison','Parent discussion','Professional conversation','Exposure activity','Skill building','Project','Appointment','Follow-up','Referral']
export type TaskDetails={responsibleParty:string;category:string;priority:string;dependencies:string[];documentIds:string[];evidence:string;verification:string;classroomVisible:boolean}
export const blankTask=():TaskDetails=>({responsibleParty:'Counsellor',category:'Follow-up',priority:'Normal',dependencies:[],documentIds:[],evidence:'',verification:'Pending',classroomVisible:false})
export class TaskError extends Error {readonly statusCode:number;constructor(message:string,statusCode=400){super(message);this.statusCode=statusCode}}
export function validateTaskDetails(value:unknown):TaskDetails{
 if(value===undefined||value===null)return blankTask()
 if(typeof value!=='object'||Array.isArray(value))throw new TaskError('Provide valid task details.')
 const input=value as Record<string,unknown>,result=blankTask()
 for(const [key,options] of Object.entries({responsibleParty:responsibleParties,category:taskCategories,priority:['Low','Normal','High','Urgent'],verification:['Pending','Evidence requested','Checked']})){
  const value=input[key]??result[key as keyof TaskDetails];if(typeof value!=='string'||!options.includes(value))throw new TaskError(`Choose a valid ${key}.`);(result as unknown as Record<string,unknown>)[key]=value
 }
 for(const key of ['dependencies','documentIds'] as const){const values=input[key]??[];if(!Array.isArray(values)||values.length>100||values.some(v=>typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)))throw new TaskError('Task links are invalid.');result[key]=[...new Set(values)]}
 const evidence=input.evidence??'';if(typeof evidence!=='string'||evidence.length>5000)throw new TaskError('Evidence notes must be under 5,000 characters.');result.evidence=evidence.trim()
 if(input.classroomVisible!==undefined&&typeof input.classroomVisible!=='boolean')throw new TaskError('Choose the classroom visibility.');result.classroomVisible=input.classroomVisible===true
 if(result.verification==='Checked'&&!result.evidence&&!result.documentIds.length)throw new TaskError('Record checked evidence or a document before marking the task checked.')
 return result
}
