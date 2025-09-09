'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { useSite } from '@/components/site/SiteProvider'
import NoSitesBanner from '@/components/site/NoSitesBanner'
import DiagnosticsPanel from '@/components/admin/DiagnosticsPanel'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { sites, currentSiteId, setCurrentSiteId } = useSite()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
    { name: 'Studies', href: '/studies', icon: FolderIcon },
    { name: 'Subjects', href: '/subjects', icon: UsersIcon },
    { name: 'Visits', href: '/visits', icon: CalendarIcon },
    { name: 'Lab Kits', href: '/lab-kits', icon: BeakerIcon },
    { name: 'Shipments', href: '/shipments', icon: TruckIcon },
    { name: 'Compliance', href: '/compliance', icon: DocumentChartBarIcon },
    { name: 'Members', href: '/members', icon: UsersIcon },
    { name: 'Monitor Actions', href: '/monitor-actions', icon: ClipboardListIcon },
    { name: 'Deviations', href: '/deviations', icon: ExclamationTriangleIcon },
  ]

  return (
    <div className="min-h-screen bg-black">
      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 flex z-40 md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-gray-900/95 backdrop-blur-sm border-r border-gray-700">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                onClick={() => setSidebarOpen(false)}
              >
                <XMarkIcon className="h-6 w-6 text-white" />
              </button>
            </div>
            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <div className="flex-shrink-0 flex items-center px-4">
                <h1 className="text-lg font-semibold text-white">Study Coordinator Pro</h1>
              </div>
              <nav className="mt-5 px-2 space-y-1">
                {navigation.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    className={`${
                      pathname === item.href
                        ? 'bg-blue-600/20 border-l-4 border-blue-400 text-white'
                        : 'text-gray-300 hover:bg-gray-700/50 hover:text-white border-l-4 border-transparent hover:border-gray-600'
                    } group flex items-center px-2 py-2 text-base font-medium rounded-r-lg transition-all`}
                  >
                    <item.icon
                      className={`${
                        pathname === item.href 
                          ? 'text-blue-400' 
                          : 'text-gray-400 group-hover:text-gray-300'
                      } mr-4 flex-shrink-0 h-6 w-6`}
                    />
                    {item.name}
                  </a>
                ))}
              </nav>
            </div>
            <div className="flex-shrink-0 border-t border-gray-700 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Theme</span>
                <ThemeToggle />
              </div>
              <div className="space-y-1">
                <label className="block text-xs text-gray-400">Site</label>
                <select
                  value={currentSiteId || ''}
                  onChange={(e) => setCurrentSiteId(e.target.value || null)}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {sites.length === 0 && <option value="">No sites</option>}
                  {sites.map(site => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center w-full text-sm text-gray-400 hover:text-white transition-colors"
              >
                <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5 text-gray-500" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <div className="flex-1 flex flex-col min-h-0 border-r border-gray-700 bg-gray-900/95 backdrop-blur-sm">
          <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
            <div className="flex items-center flex-shrink-0 px-4">
              <h1 className="text-lg font-semibold text-white">Study Coordinator Pro</h1>
            </div>
            <nav className="mt-5 flex-1 px-2 space-y-1">
              {navigation.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className={`${
                    pathname === item.href
                      ? 'bg-blue-600/20 border-l-4 border-blue-400 text-white'
                      : 'text-gray-300 hover:bg-gray-700/50 hover:text-white border-l-4 border-transparent hover:border-gray-600'
                  } group flex items-center px-2 py-2 text-sm font-medium rounded-r-lg transition-all`}
                >
                  <item.icon
                    className={`${
                      pathname === item.href 
                        ? 'text-blue-400' 
                        : 'text-gray-400 group-hover:text-gray-300'
                    } mr-3 flex-shrink-0 h-6 w-6`}
                  />
                  {item.name}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex-shrink-0 border-t border-gray-700 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Theme</span>
              <ThemeToggle />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-gray-400">Site</label>
              <select
                value={currentSiteId || ''}
                onChange={(e) => setCurrentSiteId(e.target.value || null)}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {sites.length === 0 && <option value="">No sites</option>}
                {sites.map(site => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center w-full text-sm text-gray-400 hover:text-white transition-colors"
            >
              <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5 text-gray-500" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="md:pl-64 flex flex-col flex-1">
        <div className="sticky top-0 z-10 md:hidden pl-1 pt-1 sm:pl-3 sm:pt-3 bg-black">
          <button
            className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
        </div>
        <main className="flex-1">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              <NoSitesBanner />
              <DiagnosticsPanel />
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

// Icon components (using heroicons)
function HomeIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function FolderIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

function UsersIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function CalendarIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function ChartBarIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

function ClipboardListIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )
}

function ExclamationTriangleIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  )
}

function XMarkIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function Bars3Icon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function BeakerIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2z" />
    </svg>
  )
}

function DocumentChartBarIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function TruckIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 18V6l4-4v4h10v12H8z" />
      <circle cx="8.5" cy="18.5" r="1.5" />
      <circle cx="17.5" cy="18.5" r="1.5" />
    </svg>
  )
}

function ArrowRightOnRectangleIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  )
}
