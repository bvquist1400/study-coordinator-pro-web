'use client'

import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function LoginPage() {
  const router = useRouter()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        router.push('/dashboard')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <button 
            onClick={() => router.push('/')}
            className="text-blue-400 hover:text-blue-300 transition-colors mb-6 inline-block"
          >
            ← Back to Home
          </button>
          <h2 className="text-3xl font-bold text-white mb-2">
            Study Coordinator Pro
          </h2>
          <p className="text-gray-300">
            Sign in to your coordinator account
          </p>
          <div className="mt-4 flex items-center justify-center space-x-2">
            <div className="h-1 w-8 bg-gradient-to-r from-purple-500 to-purple-700 rounded-full"></div>
            <div className="text-gray-400 text-sm">Clinical Research Productivity Suite</div>
            <div className="h-1 w-8 bg-gradient-to-r from-purple-500 to-purple-700 rounded-full"></div>
          </div>
        </div>
        
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl shadow-2xl py-8 px-6 sm:px-8">
          <Auth
            supabaseClient={supabase}
            appearance={{ 
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#2563eb',
                    brandAccent: '#1d4ed8',
                    brandButtonText: 'white',
                    defaultButtonBackground: '#374151',
                    defaultButtonBackgroundHover: '#4b5563',
                    defaultButtonBorder: '#6b7280',
                    defaultButtonText: '#f3f4f6',
                    dividerBackground: '#4b5563',
                    inputBackground: '#374151',
                    inputBorder: '#6b7280',
                    inputBorderHover: '#60a5fa',
                    inputBorderFocus: '#3b82f6',
                    inputText: '#f3f4f6',
                    inputLabelText: '#d1d5db',
                    inputPlaceholder: '#9ca3af',
                    messageText: '#f87171',
                    messageTextDanger: '#ef4444',
                    anchorTextColor: '#60a5fa',
                    anchorTextHoverColor: '#93c5fd',
                  },
                  space: {
                    spaceSmall: '4px',
                    spaceMedium: '8px',
                    spaceLarge: '16px',
                    labelBottomMargin: '8px',
                    anchorBottomMargin: '4px',
                    emailInputSpacing: '4px',
                    socialAuthSpacing: '4px',
                    buttonPadding: '10px 15px',
                    inputPadding: '10px 15px',
                  },
                  fontSizes: {
                    baseBodySize: '14px',
                    baseInputSize: '14px',
                    baseLabelSize: '14px',
                    baseButtonSize: '14px',
                  },
                  fonts: {
                    bodyFontFamily: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`,
                    buttonFontFamily: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`,
                    inputFontFamily: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`,
                    labelFontFamily: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`,
                  },
                  borderWidths: {
                    buttonBorderWidth: '1px',
                    inputBorderWidth: '1px',
                  },
                  radii: {
                    borderRadiusButton: '8px',
                    buttonBorderRadius: '8px',
                    inputBorderRadius: '8px',
                  }
                }
              },
              className: {
                container: 'auth-container',
                button: 'hover:scale-105 transition-all',
                input: 'bg-gray-700/50 border-gray-600 focus:border-blue-500 rounded-lg',
                label: 'text-gray-300 font-medium',
                anchor: 'text-blue-400 hover:text-blue-300 transition-colors',
                divider: 'text-gray-400',
                message: 'text-red-400',
              }
            }}
            theme="dark"
            providers={['google']}
            redirectTo={`${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`}
            localization={{
              variables: {
                sign_in: {
                  email_label: 'Email address',
                  password_label: 'Password',
                  button_label: 'Sign In',
                  social_provider_text: 'Sign in with {{provider}}',
                  link_text: "Already have an account? Sign in"
                },
                sign_up: {
                  email_label: 'Email address',
                  password_label: 'Create password',
                  button_label: 'Create Account',
                  social_provider_text: 'Sign up with {{provider}}',
                  link_text: "Don't have an account? Sign up"
                }
              }
            }}
          />
        </div>
        
        <div className="text-center">
          <p className="text-gray-400 text-sm">
            By signing in, you agree to our terms and privacy policy
          </p>
          <p className="text-gray-500 text-xs mt-2">
            Personal productivity tool - does not replace regulatory requirements
          </p>
        </div>
      </div>
    </div>
  )
}