export const guidanceStaff = (role:string) => ['owner','admin','lead_counsellor','counsellor','guidance_teacher'].includes(role)
export const counsellingStaff = (role:string) => ['owner','admin','lead_counsellor','counsellor'].includes(role)
export const staffRoleOptions = [['counsellor','Counsellor'],['lead_counsellor','Lead counsellor'],['guidance_teacher','Guidance teacher'],['teacher','Class teacher (limited)'],['data_entry','Data entry operator'],['reviewer','Read-only reviewer']] as const
