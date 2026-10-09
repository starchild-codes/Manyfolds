import type { ReactNode } from 'react'

export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return <section className="intro page-header">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {action && <div className="page-header-action">{action}</div>}
  </section>
}

export function EmptyState({ title, description, action, compact = false }: {
  title: string
  description: string
  action?: ReactNode
  compact?: boolean
}) {
  return <div className={`ui-empty-state${compact ? ' compact' : ''}`}>
    <span className="ui-empty-mark" aria-hidden="true">✦</span>
    <h3>{title}</h3><p>{description}</p>
    {action && <div className="ui-empty-action">{action}</div>}
  </div>
}

export function LoadingSkeleton({ rows = 3, label = 'Loading content' }: { rows?: number; label?: string }) {
  return <div className="ui-skeleton" role="status" aria-label={label}>
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, index) => <i key={index} />)}
  </div>
}

export function StatusBadge({ children, tone = 'neutral' }: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  return <span className={`ui-status-badge ${tone}`}>{children}</span>
}
