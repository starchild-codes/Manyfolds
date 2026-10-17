import { operationsRequest } from './operationsApi'
import { scopedStorageKey } from './workspaceStorage'
export type SavedPath={name:string;type:string;path:string;preferred?:boolean}
export const getSavedPaths=async()=>(await operationsRequest<{items:SavedPath[]}>('/saved-paths')).items
const change=async(method:string,body:unknown)=>(await operationsRequest<{items:SavedPath[]}>('/saved-paths',{method,body:JSON.stringify(body)})).items
export const savePath=(item:SavedPath)=>change('POST',item)
export const removeSavedPath=(path:string)=>change('DELETE',{path})
export const preferSavedPath=(path:string)=>change('PATCH',{path})
// Legacy storage was school-scoped, so never silently assign those bookmarks to a person.
export const getLegacySavedPaths=():SavedPath[]=>{try{const rows:unknown=JSON.parse(localStorage.getItem(scopedStorageKey('cc-saved-pathways-v1'))||'[]');if(!Array.isArray(rows))return [];return rows.slice(0,500).flatMap(value=>{if(!value||typeof value.name!=='string'||typeof value.type!=='string'||typeof value.path!=='string'||value.name.length>300)return [];let path=value.path;if(/^\/(exams|scholarships)\//.test(path))path=`/dashboard?view=${path.split('/')[1]}&q=${encodeURIComponent(value.name)}`;return [{name:value.name,type:value.type,path}]})}catch{return []}}
