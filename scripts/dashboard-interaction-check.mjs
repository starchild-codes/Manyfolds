import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const app=readFileSync('src/App.tsx','utf8'),roadmap=readFileSync('src/Roadmap.tsx','utf8'),detail=readFileSync('src/RecommendationDetail.tsx','utf8'),knowledge=readFileSync('src/KnowledgeDatabase.tsx','utf8')
for(const label of ['New student','View follow-ups','Download summary','Export selected','Add counsellor step','Export roadmap','Add to student plan','Save to My Plan'])assert.ok(`${app}${roadmap}${detail}${knowledge}`.includes(label),`missing action: ${label}`)
assert.ok(app.includes("Promise.allSettled(pending.map(s=>updateStudentRecord(") && app.includes("result.status==='fulfilled'"),'Mark all reviewed must update only records confirmed by the server')
assert.ok(app.includes('await updateStudentRecord(student)') && !app.includes("Promise.all(students.map(s=>savePrivate('student'"),'Student edits must wait for persistence rather than autosaving the whole register')
assert.ok(app.includes('deleteStudentRecord(student).then(()=>{setStudents'),'Student deletion must wait for server confirmation')
assert.ok(detail.includes('await savePath(')&&detail.includes('removeSavedPath(')&&detail.includes('preferSavedPath('),'Saved pathways must wait for persistence and support removal/preference; API behavior is covered by test:saved-pathways')
assert.ok(roadmap.includes("'/roadmap-checklist'")&&!roadmap.includes("localStorage.setItem"),'Roadmap checklist saves must use the shared school API')
console.log('Dashboard interaction integrity checks passed')
