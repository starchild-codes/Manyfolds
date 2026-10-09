import assert from 'node:assert/strict'
import { scopedStorageKey, setWorkspaceScope } from '../src/workspaceStorage.ts'

setWorkspaceScope(null)
assert.throws(() => scopedStorageKey('cc-student-roadmap-v1'))
setWorkspaceScope('school-a')
const first = scopedStorageKey('cc-student-roadmap-v1')
setWorkspaceScope('school-b')
const second = scopedStorageKey('cc-student-roadmap-v1')
assert.notEqual(first, second)
assert.equal(scopedStorageKey('cc-saved-pathways-v1'), 'cc-org-school-b-cc-saved-pathways-v1')
setWorkspaceScope(null)
console.log('Workspace browser storage isolation passed')
