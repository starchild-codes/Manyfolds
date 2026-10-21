export const pipelineStages=[
 ['not_onboarded','Not onboarded'],['basic_record_created','Basic record created'],['profile_incomplete','Profile incomplete'],['ready_for_review','Ready for review'],['initial_session_required','Initial session required'],['initial_session_completed','Initial session completed'],['exploring_pathways','Exploring pathways'],['pathways_shortlisted','Pathways shortlisted'],['action_plan_active','Action plan active'],['applications_in_progress','Applications or examinations in progress'],['outcome_pending','Outcome pending'],['outcome_recorded','Outcome recorded'],['alumni_follow_up','Alumni follow-up'],['archived','Archived']
] as const
export type PipelineStage=typeof pipelineStages[number][0]
export type PipelineFacts={profileAreas:number;completedSession:boolean;activePathway:boolean;activePlan:boolean;applicationActivity:boolean;outcome:boolean}
export const stageLabel=(key:PipelineStage)=>pipelineStages.find(s=>s[0]===key)![1]
export const isPipelineStage=(value:unknown):value is PipelineStage=>pipelineStages.some(s=>s[0]===value)
export function pipelineStage(payload:Record<string,unknown>,archived=false):PipelineStage{
 if(archived)return 'archived'
 if(isPipelineStage(payload.pipelineStage)&&payload.pipelineStage!=='archived')return payload.pipelineStage
 const legacy:Record<string,PipelineStage>={'Not started':'basic_record_created','Initial profile':'profile_incomplete','Exploring options':'exploring_pathways','Pathway shortlisted':'pathways_shortlisted','Transition confirmed':'outcome_recorded'}
 return pipelineStages.find(s=>s[1]===payload.stage&&s[0]!=='archived')?.[0]||legacy[String(payload.stage)]||'basic_record_created'
}
export function pipelineRequirement(stage:PipelineStage,facts:PipelineFacts){
 if(stage==='ready_for_review'&&facts.profileAreas<2)return 'Record at least two profile areas before marking ready for review.'
 if(stage==='initial_session_completed'&&!facts.completedSession)return 'Save a completed student session first.'
 if(stage==='pathways_shortlisted'&&!facts.activePathway)return 'Save an active student pathway first.'
 if(stage==='action_plan_active'&&!facts.activePlan)return 'Save an active action plan first.'
 if(['applications_in_progress','outcome_pending'].includes(stage)&&!facts.applicationActivity)return 'Record an examination-registration task or a course-application outcome first.'
 if(['outcome_recorded','alumni_follow_up'].includes(stage)&&!facts.outcome)return 'Record a student outcome first.'
 return ''
}
export function suggestedPipelineStage(current:PipelineStage,facts:PipelineFacts):PipelineStage|null{
 if(current==='archived')return null
 const candidate:PipelineStage=facts.outcome?'outcome_recorded':facts.applicationActivity?'applications_in_progress':facts.activePlan?'action_plan_active':facts.activePathway?'pathways_shortlisted':facts.completedSession?'initial_session_completed':facts.profileAreas>=2?'ready_for_review':'profile_incomplete'
 return pipelineStages.findIndex(s=>s[0]===candidate)>pipelineStages.findIndex(s=>s[0]===current)?candidate:null
}
