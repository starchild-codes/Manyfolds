export const interventionTypes=['Career-awareness workshop','Stream-selection session','Scholarship clinic','Parent orientation','Alumni panel','Professional interaction','Workplace visit','Vocational-pathway session','Entrance-exam briefing','Application workshop','Portfolio workshop','Subject-choice session','Financial-planning session']
export type InterventionDetails={type:string;objective:string;targetCohort:string;selectionCriteria:string;organizer:string;staffId:string;venue:string;resources:string;resourceIds:string[];attendance:Record<string,string>;pre:Record<string,string>;post:Record<string,string>;feedback:Record<string,string>;reflections:string;taskIds:string[];cost:string;partner:string}
export const blankIntervention=():InterventionDetails=>({type:interventionTypes[0],objective:'',targetCohort:'',selectionCriteria:'',organizer:'',staffId:'',venue:'',resources:'',resourceIds:[],attendance:{},pre:{},post:{},feedback:{},reflections:'',taskIds:[],cost:'',partner:''})
export function validateIntervention(value:unknown,keys:string[],completed:boolean):InterventionDetails{
 if(value===undefined)value={};if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Provide valid intervention details.')
 const raw=value as Record<string,unknown>,result=blankIntervention()
 for(const key of ['type','objective','targetCohort','selectionCriteria','organizer','staffId','venue','resources','reflections','cost','partner'] as const){const v=raw[key]??result[key];if(typeof v!=='string'||v.length>(['objective','resources','reflections'].includes(key)?5000:500))throw Error(`Invalid intervention ${key}.`);result[key]=v.trim()}
 if(!interventionTypes.includes(result.type))throw Error('Choose an intervention type.')
 const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
 if(result.staffId&&!uuid(result.staffId))throw Error('Choose an active organiser.')
 for(const field of ['resourceIds','taskIds'] as const){const items=raw[field]??[];if(!Array.isArray(items)||items.length>100||items.some(i=>!uuid(i)))throw Error(`Invalid linked ${field}.`);result[field]=[...new Set(items)]}
 for(const field of ['attendance','pre','post','feedback'] as const){const entries=raw[field]??{};if(!entries||typeof entries!=='object'||Array.isArray(entries))throw Error(`Invalid ${field} records.`);for(const [k,v] of Object.entries(entries)){if(!keys.includes(k)||typeof v!=='string'||v.length>2000)throw Error('Student responses must belong to this intervention cohort.');result[field][k]=v.trim()}}
 for(const k of keys){const a=result.attendance[k]||'Not recorded';if(!['Not recorded','Present','Absent','Excused'].includes(a))throw Error('Choose a valid attendance status.');if(completed&&a==='Not recorded')throw Error('Record attendance for each student before completing the intervention.');result.attendance[k]=a}
 return result
}
