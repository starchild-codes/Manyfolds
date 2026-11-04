import { useEffect } from 'react'
import { downloadPrintable } from './printDocument'
import PublicShell from './PublicShell'
import './PublicPages.css'
import { contact, publicPages, worksheets } from './publicContent'

export default function PublicPages({ path }: { path: keyof typeof publicPages }) {
  const page = publicPages[path]
  useEffect(() => {
    document.title = page.title + ' | Manyfolds'
    return () => { document.title = 'Manyfolds | More Than One Way Forward' }
  }, [page.title])
  return <PublicShell current={path}>
    <main id="public-content" className="public-article">
      <p className="public-eyebrow">More than one way forward</p><h1>{page.title}</h1>
      <p className="public-article-intro">{page.intro}</p>
      {page.sections.map(([title, text]) => <section key={title}><h2>{title}</h2><p>{text}</p></section>)}
      {path === '/contact' && <a className="public-button" href={'mailto:' + contact + '?subject=Manyfolds%20project%20enquiry'}>Email Manyfolds ↗</a>}
      {path === '/resources' && <section><h2>Download a printable worksheet</h2>
        {worksheets.map(worksheet => <article key={worksheet.title}><h3>{worksheet.title}</h3>
          <button className="public-button" onClick={() => downloadPrintable({
            title: worksheet.title, classification: 'GUIDANCE WORKSHEET - FOR STAFF-MEDIATED DISCUSSION',
            metadata: { Publisher: 'Manyfolds', Generated: new Date().toISOString() },
            sections: worksheet.prompts.map((prompt, index) => ({ title: (index + 1) + '. ' + prompt, body: 'Discussion notes: __________________________________________________\n________________________________________________________________' })),
          }, worksheet.title.toLowerCase().replaceAll(' ', '-') + '.html')}>Download / Print</button>
        </article>)}
      </section>}
      {path !== '/contact' && <div className="public-article-cta"><p>See the guidance journey with a fictional student.</p><a className="public-button" href="/demo">Try the interactive demo →</a></div>}
    </main>
  </PublicShell>
}
