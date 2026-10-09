import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<main className="content" role="status">Loading Manyfolds...</main>}><App /></Suspense>
  </StrictMode>,
)
