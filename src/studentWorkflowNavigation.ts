import type { MouseEvent } from 'react'
export type StudentWorkflowView = 'students' | 'diagnostic' | 'roadmap' | 'sessions' | 'followups'
export function diagnosticGrade(grade: string) {
 const matched=grade.match(/^(?:Class\s*)?(8|9|10|11|12)(?:\s|[A-Z]|$)/i)
 return matched?`Class ${matched[1]}`:''
}
export function studentWorkflowUrl(view: StudentWorkflowView, studentKey: string, career?: string) {
 const params = new URLSearchParams({ view })
 if (studentKey) params.set('student', studentKey)
 if (view === 'roadmap' && career) params.set('career', career)
 return `/dashboard?${params}`
}
export function followStudentWorkflow(event: MouseEvent<HTMLAnchorElement>, view: StudentWorkflowView, studentKey: string, career?: string) {
 if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return
 const navigation = new CustomEvent('manyfolds-student-workflow', { detail: { view, studentKey, career }, cancelable: true })
 if (!window.dispatchEvent(navigation)) event.preventDefault()
}
