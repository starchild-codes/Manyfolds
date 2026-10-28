export class SetupError extends Error { readonly status=400 }

export function validateSchoolSetup(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SetupError('School setup must be an object.')
 const body=value as Record<string,unknown>
 const field=(key:string,max=200,required=false)=>{const v=body[key];if(v!==undefined&&typeof v!=='string')throw new SetupError(`Invalid ${key}.`);const text=(v as string||'').trim();if(text.length>max||(required&&!text))throw new SetupError(`Complete ${key} (up to ${max} characters).`);return text}
 const name=field('name',200,true),schoolType=field('schoolType',80,true),city=field('city',200,true),state=field('state',200,true),country=field('country',100,true)
 const estimate=body.approximateStudentCount
 if(typeof estimate!=='number'||!Number.isInteger(estimate)||estimate<1||estimate>1000000)throw new SetupError('Enter the approximate student count, between 1 and 1,000,000.')
 if(!Array.isArray(body.classes)||!body.classes.length||body.classes.length>30)throw new SetupError('Add between 1 and 30 classes.')
 const names=new Set<string>()
 const classes=body.classes.map(entry=>{
  if(!entry||typeof entry!=='object'||typeof entry.name!=='string'||!entry.name.trim()||entry.name.trim().length>50||!Array.isArray(entry.sections)||entry.sections.length>30)throw new SetupError('Each class needs a name and up to 30 sections.')
  const name=entry.name.trim();if(names.has(name.toLowerCase()))throw new SetupError('Each class should appear only once.');names.add(name.toLowerCase())
  const seen=new Set<string>();const sections=entry.sections.map((v:unknown)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>50)throw new SetupError('Use section names of 1 to 50 characters.');const label=v.trim();if(seen.has(label.toLowerCase()))throw new SetupError('Each section should appear only once per class.');seen.add(label.toLowerCase());return label})
  return {name,sections}
 })
 const settings:Record<string,string>={}
 for(const key of ['board','academicYear','contactEmail','contactPhone','counsellingModel']){const text=field(key);if(text)settings[key]=text}
 if(settings.contactEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contactEmail))throw new SetupError('Enter a valid school contact email.')
 return {name,schoolType,city,state,country,estimate,classes,settings}
}
