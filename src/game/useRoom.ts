import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'

export type Peer = { id:string; name:string; x:number; y:number; color:number }
export type RoomChat = { id:string; name:string; text:string }
export type GameEvent = { id:string; type:string; data:unknown; from:string; at:number }
const colors = [0x6ea2b6,0xb16c8a,0x8fa767,0xa78ac4,0xd29e51]

function roomInfo(){
  const existing = new URLSearchParams(location.search).get('room')?.toUpperCase()
  if(existing) return {code:existing,isHost:true}
  const code = Math.random().toString(36).slice(2,7).toUpperCase()
  sessionStorage.setItem('lounge-host',code)
  history.replaceState({},'',`?room=${code}`)
  return {code,isHost:true}
}

export function useRoom(name:string) {
  const info = useMemo(roomInfo,[])
  const id = useMemo(() => crypto.randomUUID(),[])
  const [peers,setPeers] = useState<Peer[]>([])
  const [messages,setMessages] = useState<RoomChat[]>([])
  const [gameEvents,setGameEvents] = useState<GameEvent[]>([])
  const [connected,setConnected] = useState(false)
  const channel = useMemo<RealtimeChannel|null>(() => supabase?.channel(`lounge:${info.code}`,{config:{presence:{key:id}}}) ?? null,[info.code,id])

  useEffect(()=>{
    if(!channel)return
    channel
      .on('presence',{event:'sync'},()=>{
        const state=channel.presenceState() as Record<string,Array<Peer>>
        setPeers(Object.values(state).flat().filter(peer=>peer.id!==id))
      })
      .on('broadcast',{event:'chat'},({payload})=>setMessages(current=>[...current.slice(-50),payload as RoomChat]))
      .on('broadcast',{event:'game'},({payload})=>setGameEvents(current=>[...current.slice(-299),payload as GameEvent]))
      .subscribe(status=>{
        setConnected(status==='SUBSCRIBED')
        if(status==='SUBSCRIBED') void channel.track({id,name,x:300,y:420,color:colors[Math.floor(Math.random()*colors.length)]})
      })
    return()=>{void channel.unsubscribe()}
  },[channel,id,name])

  const sendChat = useCallback((text:string)=>{
    if(!text.trim())return
    const payload={id:crypto.randomUUID(),name,text:text.trim()}
    setMessages(current=>[...current.slice(-50),payload])
    if(channel)void channel.send({type:'broadcast',event:'chat',payload})
  },[channel,name])

  const sendGame = useCallback((type:string,data:unknown)=>{
    const payload:GameEvent={id:crypto.randomUUID(),type,data,from:id,at:Date.now()}
    setGameEvents(current=>[...current.slice(-299),payload])
    if(channel)void channel.send({type:'broadcast',event:'game',payload})
  },[channel,id])

  return { ...info, id, peers, messages, gameEvents, connected, sendChat, sendGame }
}
