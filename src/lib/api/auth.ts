import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

// Server-side Supabase client
export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export interface AuthResult {
  user: any
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
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    
    if (error || !user) {
      return {
        user: null,
        error: 'Invalid token',
        status: 401
      }
    }

    return { user }
  } catch (error) {
    console.error('Authentication error:', error)
    return {
      user: null,
      error: 'Authentication failed',
      status: 500
    }
  }
}

/**
 * Verify user owns a study
 */
export async function verifyStudyOwnership(studyId: string, userId: string): Promise<{ success: boolean; error?: string; status?: number }> {
  try {
    const { data: study, error } = await supabaseAdmin
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
    console.error('Study ownership verification error:', error)
    return {
      success: false,
      error: 'Failed to verify study ownership',
      status: 500
    }
  }
}