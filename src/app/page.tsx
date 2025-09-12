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
      {/* PHI Notice Banner */}
      <div className="bg-gradient-to-r from-red-900/30 to-orange-900/30 border-b border-red-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-center space-x-3">
            <div className="flex-shrink-0">
              <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                <span className="text-white text-sm font-bold">!</span>
              </div>
            </div>
            <p className="text-red-200 text-sm font-medium text-center">
              <strong>IMPORTANT:</strong> This system is designed for workflow optimization only. 
              <span className="text-red-100 font-semibold"> NO PHI (Protected Health Information) should be entered.</span> 
              Use anonymized identifiers only.
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Header */}
      <header className="border-b border-gray-700/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">SCP</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Study Coordinator Pro</h1>
                <p className="text-xs text-gray-400">Clinical Research Management Platform</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => router.push('/login')}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-2.5 rounded-lg transition-all duration-300 hover:scale-[1.02] shadow-lg hover:shadow-blue-500/25 font-medium"
              >
                Access Platform
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-transparent to-purple-900/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 bg-blue-900/30 border border-blue-700/50 rounded-full px-4 py-2 text-sm text-blue-200 mb-8">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span>Personal Productivity Tool for Clinical Research</span>
            </div>
            
            <h1 className="text-6xl md:text-7xl font-black text-white mb-8 leading-tight">
              Clinical Research
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-purple-500 to-teal-400 bg-clip-text text-transparent">
                Coordinating Redefined
              </span>
            </h1>
            
            <p className="text-xl text-gray-300 mb-12 max-w-4xl mx-auto leading-relaxed">
              A personal productivity platform designed to help clinical research coordinators 
              optimize their daily workflows. Streamline visit scheduling, track compliance calculations, 
              and manage study tasks more efficiently.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6 mb-12">
              <button 
                onClick={() => router.push('/login')}
                className="group bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-10 py-4 rounded-2xl text-lg font-semibold transition-all duration-300 hover:scale-[1.02] shadow-2xl hover:shadow-blue-500/25 relative overflow-hidden"
              >
                <span className="relative z-10">Start 30-Day Trial</span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
              
              <button className="flex items-center space-x-2 text-gray-300 hover:text-white transition-colors duration-300 group">
                <div className="w-12 h-12 rounded-full border-2 border-gray-600 group-hover:border-white flex items-center justify-center transition-colors duration-300">
                  <div className="w-0 h-0 border-l-[6px] border-l-gray-400 group-hover:border-l-white border-y-[4px] border-y-transparent ml-1 transition-colors duration-300"></div>
                </div>
                <span className="font-medium">Watch Demo (2:30)</span>
              </button>
            </div>

            {/* Key Features */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div className="space-y-2">
                <div className="text-2xl font-bold text-blue-400">📊</div>
                <div className="text-sm text-gray-400">Compliance Tracking</div>
              </div>
              <div className="space-y-2">
                <div className="text-2xl font-bold text-purple-400">📅</div>
                <div className="text-sm text-gray-400">Visit Scheduling</div>
              </div>
              <div className="space-y-2">
                <div className="text-2xl font-bold text-green-400">📋</div>
                <div className="text-sm text-gray-400">Study Management</div>
              </div>
              <div className="space-y-2">
                <div className="text-2xl font-bold text-orange-400">📦</div>
                <div className="text-sm text-gray-400">Lab Kit Tracking</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Clinical Workflow Solutions */}
      <section className="py-24 bg-gradient-to-b from-gray-900/50 to-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-6">
              Purpose-Built for Clinical Excellence
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Every feature designed around real-world coordinator workflows and daily productivity needs
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Advanced IP Accountability */}
            <div className="group glass-card p-8 hover:scale-[1.02] transition-all duration-300">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">IP Accountability & Compliance</h3>
              <p className="text-gray-300 mb-4">
                Automated dispensing calculations, return tracking, and compliance monitoring 
                with 80% threshold alerts and organized record keeping.
              </p>
              <div className="text-sm text-emerald-400 font-medium">
                • Multi-bottle tracking • Dose calculation • Compliance scoring
              </div>
            </div>

            {/* Visit Window Management */}
            <div className="group glass-card p-8 hover:scale-[1.02] transition-all duration-300">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Precision Visit Scheduling</h3>
              <p className="text-gray-300 mb-4">
                Dynamic visit windows with protocol-specific timing rules, automated reminders, 
                and rescheduling tools to help maintain visit schedules.
              </p>
              <div className="text-sm text-blue-400 font-medium">
                • Window calculations • Timeline views • Reminder automation
              </div>
            </div>


            {/* Multi-Study Dashboard */}
            <div className="group glass-card p-8 hover:scale-[1.02] transition-all duration-300">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Unified Multi-Study Management</h3>
              <p className="text-gray-300 mb-4">
                Centralized dashboard for coordinators managing multiple protocols simultaneously, 
                with cross-study analytics and resource optimization.
              </p>
              <div className="text-sm text-purple-400 font-medium">
                • Cross-study views • Resource planning • Priority management
              </div>
            </div>

            {/* Lab Kit & Shipment Tracking */}
            <div className="group glass-card p-8 hover:scale-[1.02] transition-all duration-300">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Lab Kit & Supply Chain</h3>
              <p className="text-gray-300 mb-4">
                Track laboratory kit inventory, manage assignments to subjects, 
                and organize shipment logistics for your studies.
              </p>
              <div className="text-sm text-teal-400 font-medium">
                • Inventory tracking • Kit assignments • Shipment management
              </div>
            </div>

            {/* Advanced Analytics */}
            <div className="group glass-card p-8 hover:scale-[1.02] transition-all duration-300">
              <div className="w-16 h-16 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Clinical Intelligence & Analytics</h3>
              <p className="text-gray-300 mb-4">
                Real-time performance dashboards with enrollment forecasting, 
                compliance trending, and predictive analytics for proactive study management.
              </p>
              <div className="text-sm text-yellow-400 font-medium">
                • Performance KPIs • Predictive insights • Custom reporting
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-6">
              Trusted by Leading Clinical Research Organizations
            </h2>
            <p className="text-xl text-gray-300">
              From academic medical centers to global CROs, coordinators rely on our platform daily
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="glass-card p-8 text-center">
              <div className="text-5xl font-bold text-blue-400 mb-2">⏱️</div>
              <div className="text-gray-300 mb-4">Save time on daily workflow management</div>
              <div className="text-sm text-gray-400">&ldquo;Simplified my daily tasks significantly&rdquo;</div>
            </div>
            
            <div className="glass-card p-8 text-center">
              <div className="text-5xl font-bold text-green-400 mb-2">📊</div>
              <div className="text-gray-300 mb-4">Track compliance calculations efficiently</div>
              <div className="text-sm text-gray-400">&ldquo;Makes compliance tracking much easier&rdquo;</div>
            </div>
            
            <div className="glass-card p-8 text-center">
              <div className="text-5xl font-bold text-purple-400 mb-2">🎯</div>
              <div className="text-gray-300 mb-4">Organized approach to study coordination</div>
              <div className="text-sm text-gray-400">&ldquo;Helps me stay on top of everything&rdquo;</div>
            </div>
          </div>

          {/* Testimonials */}
          <div className="grid md:grid-cols-2 gap-8">
            <div className="glass-card p-8">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mr-4">
                  <span className="text-white font-bold">RC</span>
                </div>
                <div>
                  <div className="font-semibold text-white">Research Coordinator</div>
                  <div className="text-sm text-gray-400">Academic Medical Center</div>
                </div>
              </div>
              <p className="text-gray-300 mb-4">
                &ldquo;Managing multiple studies used to be overwhelming. The IP compliance calculator saves me significant time each week, 
                and the visit scheduling tools help keep everything organized.&rdquo;
              </p>
              <div className="flex text-yellow-400">
                {'★'.repeat(5)}
              </div>
            </div>

            <div className="glass-card p-8">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center mr-4">
                  <span className="text-white font-bold">SM</span>
                </div>
                <div>
                  <div className="font-semibold text-white">Senior Study Manager</div>
                  <div className="text-sm text-gray-400">Phase III Oncology Site</div>
                </div>
              </div>
              <p className="text-gray-300 mb-4">
                &ldquo;The visit window calculations are helpful, and the automated reminders make it easier to stay on schedule. 
                It&apos;s made visit planning much more manageable for our team.&rdquo;
              </p>
              <div className="flex text-yellow-400">
                {'★'.repeat(5)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Compliance */}
      <section className="py-24 bg-gradient-to-b from-gray-900/30 to-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-6">
              Privacy & Security First
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Designed as a personal productivity tool with privacy and data protection in mind
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500/20 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h4 className="font-bold text-white mb-2">Secure Platform</h4>
              <p className="text-sm text-gray-400">Built with security best practices and data protection</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500/20 border border-green-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h4 className="font-bold text-white mb-2">Privacy Focused</h4>
              <p className="text-sm text-gray-400">Personal productivity tool designed around privacy principles</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-red-500/20 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 className="font-bold text-white mb-2">No PHI Storage</h4>
              <p className="text-sm text-gray-400">Designed for anonymized workflow optimization only</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-500/20 border border-purple-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h4 className="font-bold text-white mb-2">User-Friendly</h4>
              <p className="text-sm text-gray-400">Simple, intuitive interface designed for daily use</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-gradient-to-r from-blue-900/30 to-purple-900/30">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-white mb-8">
            Ready to Transform Your Clinical Research Operations?
          </h2>
          <p className="text-xl text-gray-300 mb-12">
            Start using Study Coordinator Pro to organize your clinical research workflows. 
            Try the platform today and see how it can help streamline your daily tasks.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6 mb-8">
            <button 
              onClick={() => router.push('/login')}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-12 py-4 rounded-2xl text-lg font-semibold transition-all duration-300 hover:scale-[1.02] shadow-2xl hover:shadow-blue-500/25"
            >
              Start Free 30-Day Trial
            </button>
            
            <div className="flex items-center space-x-4 text-gray-300">
              <div className="flex items-center space-x-1">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm">No credit card required</span>
              </div>
              <div className="flex items-center space-x-1">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm">Setup in under 5 minutes</span>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-gray-400 mb-4">
              Questions about implementation or need a custom enterprise solution?
            </p>
            <button className="text-blue-400 hover:text-blue-300 font-medium underline transition-colors duration-300">
              Schedule a personalized demo with our clinical research specialists
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-700/50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-2">
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">SCP</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Study Coordinator Pro</h3>
                  <p className="text-sm text-gray-400">Clinical Research Management Platform</p>
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                Purpose-built productivity platform for clinical research coordinators. 
                Designed for workflow optimization and regulatory compliance.
              </p>
              <div className="text-xs text-red-300 bg-red-900/20 border border-red-700/30 rounded-lg p-3">
                <strong>Privacy Notice:</strong> This platform is designed for workflow management using anonymized data only. 
                No Protected Health Information (PHI) should be entered into this system.
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-4">Platform</h4>
              <div className="space-y-2 text-sm">
                <div className="text-gray-400">Features</div>
                <div className="text-gray-400">Security</div>
                <div className="text-gray-400">Integrations</div>
                <div className="text-gray-400">Enterprise</div>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-4">Support</h4>
              <div className="space-y-2 text-sm">
                <div className="text-gray-400">Documentation</div>
                <div className="text-gray-400">Training</div>
                <div className="text-gray-400">Contact</div>
                <div className="text-gray-400">Status</div>
              </div>
            </div>
          </div>
          
          <div className="border-t border-gray-700/50 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm">
              © 2024 Study Coordinator Pro. Professional clinical research management platform.
            </p>
            <div className="flex items-center space-x-6 mt-4 md:mt-0">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-gray-400">System Status: Operational</span>
              </div>
              <span className="text-xs text-gray-500">v2.1.0</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
