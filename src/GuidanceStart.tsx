import './GuidanceStart.css'
const steps = [
  ['Students', 'Build the student record', 'Add or import students, confirm their class and assigned staff, then open a record.'],
  ['Career Diagnostic', 'Understand the student', 'Record and save interests, strengths and practical constraints together.'],
  ['Sessions', 'Record the conversation', 'Save the discussion, decisions and a separate summary you are comfortable sharing.'],
  ['Pathway Roadmap', 'Create and review an AI roadmap', 'Select the student and direction, generate a draft, then review and approve it before sharing.'],
  ['Tasks & Follow-ups', 'Agree the next action', 'Assign responsibility and a due date. Record progress and plan the next conversation.'],
  ['Reports', 'Review progress across the school', 'Check recorded guidance coverage, follow-through and outcomes for your authorised students.'],
] as const

export default function GuidanceStart({navigate, empty}: {navigate: (page:string) => void; empty:boolean}) {
  return <details className="guidance-start panel" open={empty || undefined}>
    <summary>Start here: the student guidance workflow</summary>
    <p>Manyfolds is your staff workspace. Students and guardians take part through conversations and approved documents; they do not need accounts.</p>
    <ol>{steps.map(([page,title,description],index) => <li key={page}>
      <span aria-hidden="true">{index+1}</span><div><h2>{title}</h2><p>{description}</p>
        <button type="button" className="text-button" onClick={() => navigate(page)}>Open {page}</button>
      </div>
    </li>)}</ol>
  </details>
}
