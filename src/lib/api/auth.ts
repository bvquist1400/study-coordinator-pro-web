import { NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'
import logger from '@/lib/logger'

// Server-side Supabase client factory
export function createSupabaseAdmin(token?: string): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error('Missing Supabase environment variable(s): NEXT_PUBLIC_SUPABASE_URL')
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (key) {
    return createClient<Database>(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  }

  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anon) {
    throw new Error('Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  if (!token) {
    throw new Error('Supabase service role key missing and no user token provided for fallback client')
  }

  return createClient<Database>(url, anon, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  })
}

export interface AuthResult {
  user: { id: string; email?: string } | null
  error?: string
  status?: number
}

/**
 * Authenticate user from Authorization header
 */
export async function authenticateUser(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization')
  
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      user: null,
      error: 'Missing or invalid authorization header',
      status: 401
    }
  }

  const token = authHeader.split(' ')[1]
  
  try {
    const supabase = createSupabaseAdmin(token)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error || !user) {
      return {
        user: null,
        error: 'Invalid token',
        status: 401
      }
    }

    return { user }
  } catch (error) {
    logger.error('Authentication error', error as any)
    return {
      user: null,
      error: error instanceof Error ? `Authentication failed: ${error.message}` : 'Authentication failed',
      status: 500
    }
  }
}

/**
 * Verify user owns a study
 */
export async function verifyStudyOwnership(studyId: string, userId: string): Promise<{ success: boolean; error?: string; status?: number }> {
  try {
    const supabase = createSupabaseAdmin()
    const { data: study, error } = await supabase
      .from('studies')
      .select('id')
      .eq('id', studyId)
      .eq('user_id', userId)
      .single()

    if (error || !study) {
      return {
        success: false,
        error: 'Study not found or access denied',
        status: 404
      }
    }

    return { success: true }
  } catch (error) {
    logger.error('Study ownership verification error', error as any)
    return {
      success: false,
      error: 'Failed to verify study ownership',
      status: 500
    }
  }
}

/**
 * Verify user is a member of the site that owns this study
 */
export async function verifyStudyMembership(studyId: string, userId: string): Promise<{ success: boolean; error?: string; status?: number }> {
  try {
    const supabase = createSupabaseAdmin()
    // Get study with site reference
    const { data: study, error: studyError } = await supabase
      .from('studies')
      .select('id, site_id')
      .eq('id', studyId)
      .single()

    if (studyError || !study) {
      return { success: false, error: 'Study not found', status: 404 }
    }

    // If site_id is not set, fall back to legacy user ownership check
    if (!(study as any).site_id) {
      return verifyStudyOwnership(studyId, userId)
    }

    // Check membership
    const { data: member, error: memberError } = await supabase
      .from('site_members')
      .select('user_id')
      .eq('site_id', (study as any).site_id as string)
      .eq('user_id', userId)
      .single()

    if (memberError || !member) {
      return { success: false, error: 'Access denied', status: 403 }
    }

    return { success: true }
  } catch (error) {
    logger.error('Study membership verification error', error as any)
    return { success: false, error: 'Failed to verify study membership', status: 500 }
  }
}
