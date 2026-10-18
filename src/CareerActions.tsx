import { useState } from 'react'
import { savePath } from './savedPathways'

export default function CareerActions({ name, studentKey }: { name: string; studentKey: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState('')
  const context = `student=${encodeURIComponent(studentKey)}`
  const path = `/careers/${encodeURIComponent(name)}?${context}`
  const save = async () => {
    if (state !== 'idle') return
    setState('saving')
    setError('')
    try {
      await savePath({ name, type: 'Career', path })
      setState('saved')
    } catch (reason) {
      setState('idle')
      setError(reason instanceof Error ? reason.message : 'This option could not be saved. Please try again.')
    }
  }
  return <>
    <div className="card-actions">
      <a className="new" href={path}>Explore Career</a>
      <a className="secondary" href={`/dashboard?view=roadmap&${context}`}>View Full Roadmap</a>
      <button className="text-button" disabled={state !== 'idle'} onClick={() => void save()}>
        {state === 'saving' ? 'Saving...' : state === 'saved' ? 'Saved' : 'Save to My Plan'}
      </button>
    </div>
    {error && <p role="alert" className="guidance-error">{error}</p>}
  </>
}
