import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AppErrorBoundary from './AppErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><Suspense fallback={<main className="content" role="status">Loading Manyfolds...</main>}><App /></Suspense></AppErrorBoundary>
  </StrictMode>,
)
