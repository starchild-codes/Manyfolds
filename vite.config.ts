import { studentDocumentsApi } from './server/school/documents.ts'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { knowledgeApi, counsellorApi } from './server/catalogue.ts'
import { aiRoadmapApi } from './server/ai/plugin.ts'
import { workspaceApi } from './server/workspace/plugin.ts'
import { studentsApi } from './server/students/plugin.ts'
import { schoolOperationsApi } from './server/school/operations.ts'
import { schoolApi } from './server/school/plugin.ts'
import { guidanceApi } from './server/guidance/plugin.ts'

const localEnv = loadEnv('development', process.cwd(), '')
// Deployment hosts provide environment variables directly; local values only fill absent keys.
const env: Record<string, string | undefined> = { ...localEnv, ...process.env }
export default defineConfig({ plugins:[react(),knowledgeApi(env),counsellorApi(env),workspaceApi(env),studentsApi(env),guidanceApi(env),schoolApi(env),schoolOperationsApi(env),studentDocumentsApi(env),aiRoadmapApi(env)], define:{__MANYFOLDS_SUPABASE_URL__:JSON.stringify(env.SUPABASE_URL||''),__MANYFOLDS_SUPABASE_ANON_KEY__:JSON.stringify(env.SUPABASE_ANON_KEY||env.PUBLISHABLE_KEY||'')} })
