import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage } from 'node:http'
import type { Pool } from 'pg'
import type { AiConfig } from './config.ts'
import type { AuthContext } from './types.ts'
import { readDatabase } from '../database.ts'
import {schoolRoles,assertAreaAccess} from '../access.ts'

export class AuthenticationError extends Error {
  readonly statusCode: number
  constructor(message: string, statusCode = 401) {
    super(message)
    this.name = 'AuthenticationError'
    this.statusCode = statusCode
  }
}

export async function authenticateRoadmapRequest(
  req: IncomingMessage,
  pool: Pool,
  config: AiConfig,
  area = 'ai',
): Promise<AuthContext> {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new AuthenticationError('Sign in is required to continue.')
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new AuthenticationError('Authentication service is not configured.', 503)
  }

  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new AuthenticationError('Your session has expired. Please sign in again.')

  let membership
  try {
    membership = await readDatabase(pool,
      `select organisation_id::text,role
       from organisation_memberships m
       where user_id=$1 and active and exists(select 1 from organisations o where o.id=m.organisation_id and o.active)
       order by created_at
       limit 1`,
      [data.user.id],
    )
  } catch {
    throw new AuthenticationError('Organisation access is not configured for AI roadmaps.', 503)
  }
  if (!membership.rowCount) {
    throw new AuthenticationError('Your account is not assigned to a Manyfolds organisation.', 403)
  }

  const row = membership.rows[0] as { organisation_id: string; role: AuthContext['role'] }
  if (!schoolRoles.includes(row.role)) {
    throw new AuthenticationError('Your role cannot generate student roadmaps.', 403)
  }
  const auth={ userId: data.user.id, organisationId: row.organisation_id, role: row.role }
  assertAreaAccess(auth,area,new URL(req.url||'/','http://localhost').pathname,req.method||'GET')
  return auth
}

