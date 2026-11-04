import { useEffect, type ReactNode } from 'react'
import { Wordmark } from './Landing'
import './PublicExperience.css'

export default function PublicShell({ children, current = '' }: { children: ReactNode; current?: string }) {
  useEffect(() => {
    const url = 'https://www.manyfolds.in' + (current || '/')
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', url)
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url)
    return () => {
      document.querySelector('link[rel="canonical"]')?.setAttribute('href', 'https://www.manyfolds.in/')
      document.querySelector('meta[property="og:url"]')?.setAttribute('content', 'https://www.manyfolds.in/')
    }
  }, [current])
  return <div className="public-shell">
    <a className="public-skip" href="#public-content">Skip to content</a>
    <header className="public-header">
      <a className="public-home" href="/" aria-label="Manyfolds home"><Wordmark /></a>
      <nav aria-label="Main navigation">
        {[['/demo', 'Try the demo'], ['/project', 'The project'], ['/how-it-works', 'How it works']].map(([href, label]) =>
          <a key={href} href={href} aria-current={current === href ? 'page' : undefined}>{label}</a>)}
      </nav>
      <a className="public-staff" href="/auth">Staff sign in <span aria-hidden="true">↗</span></a>
    </header>
    {children}
    <footer className="public-footer">
      <div><a href="/" className="public-home"><Wordmark /></a><p>A student-built project. More than one way forward.</p></div>
      <nav aria-label="Footer navigation">
        <a href="/for-schools">For schools</a><a href="/resources">Resources</a>
        <a href="/privacy">Privacy</a><a href="/contact">Contact</a>
        <a href="https://github.com/starchild-codes/Manyfolds" target="_blank" rel="noopener noreferrer">Source code ↗</a>
      </nav>
    </footer>
  </div>
}
