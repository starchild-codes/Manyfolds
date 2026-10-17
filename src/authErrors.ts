export function authRedirectError(search:string,hash:string){
 const query=new URLSearchParams(search),fragment=new URLSearchParams(hash.replace(/^#/,''))
 const code=query.get('error_code')||fragment.get('error_code')||query.get('error')||fragment.get('error')
 const message=query.get('error_description')||fragment.get('error_description')
 return code||message?{code:code||'',message:message||code||'Sign-in was not completed.'}:null
}
export function authErrorMessage(value:unknown):string{
 const error=value as {code?:string;message?:string;name?:string}|null
 const code=error?.code||'',message=error?.message||''
 if(['flow_state_expired','flow_state_not_found','bad_code_verifier'].includes(code)||/code.?verifier|pkce|flow state/i.test(message))return 'This sign-in attempt has expired or belongs to another browser. Start a new sign-in in this tab and complete it there.'
 if(code==='access_denied'||code==='user_cancelled')return 'Google sign-in was cancelled or access was denied. Please try again and complete Google’s account selection.'
 if(/invalid_client|client_secret|redirect_uri_mismatch|provider_disabled|oauth_provider_not_supported/.test(code+' '+message))return 'Google sign-in is not configured correctly. Please report this message to the Manyfolds administrator.'
 if(code==='auth_timeout')return 'The sign-in service took too long to respond. Check your connection and start a new sign-in.'
 if(error?.name==='TypeError'||/failed to fetch|network|fetch failed/i.test(message))return 'Could not reach the sign-in service. Check your connection and try again.'
 return message.slice(0,500)||'Sign-in could not be completed. Please try again.'
}
export async function withAuthTimeout<T>(request:Promise<T>,milliseconds=20_000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined
 try{return await Promise.race([request,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Sign-in timed out.'),{code:'auth_timeout'})),milliseconds)})])}finally{clearTimeout(timer)}
}
