import type { StudentRecord } from './studentRegistryApi'
import { followStudentWorkflow, studentWorkflowUrl, type StudentWorkflowView } from './studentWorkflowNavigation'
import './StudentJourney.css'

export default function StudentJourney({ student, current, diagnosticStatus }: {
 student: StudentRecord; current: 'diagnostic' | 'roadmap'; diagnosticStatus?: string
}) {
 const steps: Array<{ view: StudentWorkflowView; title: string; detail: string }> = [
  { view: 'students', title: 'Student record', detail: 'Name, class and staff assignment' },
  { view: 'diagnostic', title: 'Career diagnostic', detail: !diagnosticStatus ? 'Record interests and practical context' : diagnosticStatus === 'draft' ? 'Draft saved · finish the review step' : 'Saved · ready for roadmap planning' },
  { view: 'roadmap', title: 'AI roadmap', detail: 'Generate, review and approve the draft' },
  { view: 'followups', title: 'Follow-ups', detail: 'Assign actions and set a meeting date' },
 ]
 return <section className="student-journey" aria-label="Student guidance journey">
  <div className="student-journey-heading"><div><p className="eyebrow">Guidance for one student</p><h2>{student.name} <span>{student.grade}</span></h2></div><small>Staff-led · no student account needed</small></div>
  <ol>{steps.map((step, index) => <li key={step.view} className={current === step.view ? 'current' : ''}>
   <a href={studentWorkflowUrl(step.view, student.id)} onClick={event => followStudentWorkflow(event, step.view, student.id)} aria-current={current === step.view ? 'step' : undefined}><span className="student-journey-number">{index + 1}</span><span><b>{step.title}</b><small>{step.detail}</small></span></a>
  </li>)}</ol>
 </section>
}
