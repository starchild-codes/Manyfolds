import { Component,createRef,type ReactNode } from 'react'

export default class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false}
 private heading=createRef<HTMLHeadingElement>()
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(){console.error('Manyfolds could not render the current screen.');this.heading.current?.focus()}
 render(){
  if(!this.state.failed)return this.props.children
  return <main className="content" style={{maxWidth:640,margin:'10vh auto',padding:24}} role="alert">
   <p className="eyebrow">Manyfolds</p><h1 tabIndex={-1} ref={this.heading}>This screen couldn’t load</h1>
   <p>Reload to try again. Any changes that were not saved may need to be entered again.</p>
   {!navigator.onLine&&<p>You appear to be offline. Check your connection before retrying.</p>}
   <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:24}}><button className="new" onClick={()=>window.location.reload()}>Reload Manyfolds</button><a className="secondary" href="/dashboard">Return to dashboard</a></div>
  </main>
 }
}
