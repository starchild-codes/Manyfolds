import { scopedStorageKey } from './workspaceStorage'
export type SavedPath={name:string;type:string;path:string;preferred?:boolean}
const savedKey=()=>scopedStorageKey('cc-saved-pathways-v1')
export const getSavedPaths=()=>{try{return JSON.parse(localStorage.getItem(savedKey())||'[]') as SavedPath[]}catch{return []}}
export const savePath=(item:SavedPath)=>{const old=getSavedPaths();if(!old.some(x=>x.path===item.path))localStorage.setItem(savedKey(),JSON.stringify([...old,item]))}
export const replaceSavedPaths=(items:SavedPath[])=>localStorage.setItem(savedKey(),JSON.stringify(items))
