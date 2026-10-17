export const sessionTypes=['Initial intake','Career exploration','Stream selection','Subject selection','Academic planning','Vocational pathway','College planning','Entrance-exam planning','Scholarship and affordability','Parent meeting','Follow-up','Application planning','Post-result revision','Outcome recording','Referral','Group counselling']
export const sessionFields=[
 ['attendees','Attendees'],['reason','Reason for this session'],['topics','Topics discussed'],['questions','Questions asked'],['concerns','Student-reported concerns'],['observations','Counsellor observations'],['options','Options explored'],['information','Information and resources shared'],['decisions','Decisions recorded'],['studentActions','Actions assigned to the student'],['counsellorActions','Counsellor actions'],['pathwayUpdate','Pathway changes recorded'],['referral','Referral recorded'],['closureReason','Case closure reason'],['unresolvedQuestions','Unresolved questions']
] as const
export type SessionField=typeof sessionFields[number][0]
export type SessionDetails=Record<SessionField,string>&{sessionType:string;followUpDate:string;shareableSummary:string;summaryApproved:boolean}
export const blankSession=():SessionDetails=>({...Object.fromEntries(sessionFields.map(([key])=>[key,''])),sessionType:'Initial intake',followUpDate:'',shareableSummary:'',summaryApproved:false}) as SessionDetails
export class SessionError extends Error {readonly statusCode:number;constructor(message:string,statusCode=400){super(message);this.statusCode=statusCode}}
export function validateSession(value:unknown):SessionDetails{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SessionError('Provide a session record.')
 const input=value as Record<string,unknown>,result=blankSession()
 for(const [key,label] of [...sessionFields,['shareableSummary','Shareable summary']] as [string,string][]){if(typeof input[key]!=='string'||input[key].length>5000)throw new SessionError(`${label} must be at most 5,000 characters.`);(result as Record<string,unknown>)[key]=input[key].trim()}
 if(typeof input.sessionType!=='string'||!sessionTypes.includes(input.sessionType))throw new SessionError('Choose a valid session type.')
 result.sessionType=input.sessionType
 if(typeof input.followUpDate!=='string'||input.followUpDate&&!/^\d{4}-\d{2}-\d{2}$/.test(input.followUpDate))throw new SessionError('Choose a valid follow-up date.')
 if(input.followUpDate&&(!Number.isFinite(Date.parse(input.followUpDate))||new Date(input.followUpDate).toISOString().slice(0,10)!==input.followUpDate))throw new SessionError('Choose a valid follow-up date.')
 result.followUpDate=input.followUpDate
 if(typeof input.summaryApproved!=='boolean')throw new SessionError('Choose the summary approval status.')
 result.summaryApproved=input.summaryApproved
 if(result.summaryApproved&&!result.shareableSummary)throw new SessionError('Write a shareable summary before approving it.')
 return result
}
export const hasSessionOutcome=(record:Partial<SessionDetails>)=>Boolean(record.studentActions?.trim()||record.counsellorActions?.trim()||record.pathwayUpdate?.trim()||record.information?.trim()||record.decisions?.trim()||record.referral?.trim()||record.closureReason?.trim())
