import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react()], define: { __MANYFOLDS_SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL || ''), __MANYFOLDS_SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY || env.PUBLISHABLE_KEY || '') } }
})
