export const recordImportFields={
 class:['studentId','grade'],staff:['studentId','staffEmail'],guardians:['studentId','name','relationship','phone','email','source'],academics:['studentId','subject','result','scale','term','year','source','resultType','stream'],sessions:['studentId','title','scheduledAt','sessionType','attendees','reason','decisions','studentActions','counsellorActions','source']
} as const
export type RecordImportKind=keyof typeof recordImportFields
export const recordImportLabels:Record<RecordImportKind,string>={class:'Class assignments',staff:'Primary staff assignments',guardians:'Guardian information',academics:'Academic marks',sessions:'Historical counselling sessions'}
