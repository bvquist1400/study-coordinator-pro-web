'use client'

import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Home() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session) {
        router.push('/dashboard')
      } else {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-400 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-300">Loading Study Coordinator Pro...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Study Coordinator Pro</h1>
              <p className="text-gray-400">Clinical Research Productivity Suite</p>
            </div>
            <div className="space-x-4">
              <button 
                onClick={() => router.push('/login')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-5xl font-bold text-white mb-6">
            The Swiss Army Knife for 
            <span className="bg-gradient-to-r from-purple-500 to-purple-700 bg-clip-text text-transparent"> Clinical Research Coordinators</span>
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
            Optimize your daily clinical research workflows with our comprehensive personal productivity tool. 
            Save 1-2 hours per week managing studies, patients, and compliance.
          </p>
          <button 
            onClick={() => router.push('/login')}
            className="bg-blue-600 hover:bg-blue-700 hover:scale-105 text-white px-8 py-4 rounded-2xl text-lg font-semibold transition-all hover:shadow-2xl"
          >
            Get Started Free
          </button>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl font-bold text-center text-white mb-12">Core Features</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Compliance Calculator */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 p-6 hover:scale-105 transition-transform hover:shadow-2xl">
              <div className="bg-gradient-to-br from-green-600 to-green-700 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <span className="text-white font-bold text-xl">%</span>
              </div>
              <h4 className="text-xl font-semibold text-white mb-2">Compliance Calculator</h4>
              <p className="text-gray-300">Calculate drug compliance percentages with 80% threshold alerts and visual indicators.</p>
            </div>

            {/* Visit Planning */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 p-6 hover:scale-105 transition-transform hover:shadow-2xl">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <span className="text-white font-bold text-xl">📅</span>
              </div>
              <h4 className="text-xl font-semibold text-white mb-2">Visit Planning</h4>
              <p className="text-gray-300">Calendar view of upcoming visits with window tracking and required actions checklists.</p>
            </div>

            {/* Monitor Actions */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 p-6 hover:scale-105 transition-transform hover:shadow-2xl">
              <div className="bg-gradient-to-br from-orange-600 to-orange-700 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <span className="text-white font-bold text-xl">📋</span>
              </div>
              <h4 className="text-xl font-semibold text-white mb-2">Monitor Actions</h4>
              <p className="text-gray-300">Track action items from CRA visits with priority classification and automated reminders.</p>
            </div>

            {/* Deviation Log */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 p-6 hover:scale-105 transition-transform hover:shadow-2xl">
              <div className="bg-gradient-to-br from-red-600 to-red-700 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <span className="text-white font-bold text-xl">⚠️</span>
              </div>
              <h4 className="text-xl font-semibold text-white mb-2">Deviation Tracking</h4>
              <p className="text-gray-300">Quick entry forms for protocol deviations with severity classification and root cause analysis.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-white mb-4">Built for Real Coordinators</h3>
            <p className="text-xl text-gray-300">Designed specifically for coordinators managing 2-8 active clinical studies</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl mb-4">⏱️</div>
              <h4 className="text-xl font-semibold text-white mb-2">Save Time</h4>
              <p className="text-gray-300">Save 1-2 hours per week with optimized workflows and automated tracking.</p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">📱</div>
              <h4 className="text-xl font-semibold text-white mb-2">Cross-Device</h4>
              <p className="text-gray-300">Works seamlessly on desktop, tablet, and mobile for any workflow.</p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">🔒</div>
              <h4 className="text-xl font-semibold text-white mb-2">Compliant</h4>
              <p className="text-gray-300">Personal productivity tool that supplements existing regulatory systems.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl font-bold text-white mb-6">Ready to Optimize Your Workflows?</h3>
          <p className="text-xl text-gray-300 mb-8">
            Join clinical research coordinators who are saving hours each week with Study Coordinator Pro.
          </p>
          <button 
            onClick={() => router.push('/login')}
            className="bg-gradient-to-br from-purple-500 to-purple-700 hover:scale-105 text-white px-12 py-4 rounded-2xl text-lg font-semibold transition-all hover:shadow-2xl"
          >
            Start Free Trial
          </button>
          <p className="text-gray-400 mt-4">30-day free trial • No credit card required</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-700 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-400">© 2024 Study Coordinator Pro. For workflow optimization only, does not replace regulatory requirements.</p>
        </div>
      </footer>
    </div>
  )
}