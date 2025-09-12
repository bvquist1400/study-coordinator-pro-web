import Link from 'next/link'
import Image from 'next/image'

export default function Landing() {
  return (
    <main className="min-h-screen bg-black text-white">
      {/* Top Notice */}
      <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-b border-blue-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 text-center text-sm text-blue-200">
          <span className="font-semibold">Preview:</span> Study Coordinator Pro &mdash; product landing (coming soon)
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-gray-800/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold">SCP</span>
            </div>
            <div>
              <div className="text-lg font-bold">Study Coordinator Pro</div>
              <div className="text-xs text-gray-400">Clinical Research Workflow Assistant</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-4 py-2 rounded-lg text-sm font-medium shadow-lg shadow-blue-900/30 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* PHI Policy */}
      <section className="bg-red-900/20 border-y border-red-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 text-center text-sm text-red-200">
          <strong>Privacy Notice:</strong> This application does not store PHI. Use anonymized identifiers only.
        </div>
      </section>

      {/* Product Preview */}
      <section className="py-10 border-t border-gray-800/70 bg-gray-950/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-xl font-semibold text-gray-200 mb-4">Product Preview</h3>
          <p className="text-sm text-gray-400 mb-4">Dashboard example from the current build</p>
          <div className="rounded-2xl border border-gray-800 bg-gray-900/40 overflow-hidden shadow-xl shadow-black/30">
            {/* Place a PNG at public/dashboard-preview.png to populate this image */}
            <div className="relative w-full h-56 sm:h-72 md:h-96 lg:h-[560px]">
              <Image
                src="/dashboard-preview.png"
                alt="Dashboard preview"
                fill
                priority
                sizes="(min-width: 1024px) 1024px, 100vw"
                className="object-cover"
              />
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-500">To display: add an image at <code className="text-gray-400">public/dashboard-preview.png</code>.</div>
        </div>
      </section>

      {/* Hero */}
      <section className="relative py-20">
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900/40 to-transparent pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-6">
            Coordinate Clinical Research with Confidence
          </h1>
          <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
            A focused tool to help research teams plan visits accurately, calculate investigational product compliance, forecast lab kit needs, and stay on top of protocol windows &mdash; without adding noise.
          </p>
          <div className="mt-10 inline-flex items-center gap-3">
            <Link
              href="/login"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 px-6 py-3 rounded-xl font-semibold shadow-2xl shadow-blue-900/30 transition-transform hover:scale-[1.01]"
            >
              Access (Authorized Users)
            </Link>
            <span className="text-xs text-gray-400">Private preview &middot; Limited access</span>
          </div>
        </div>
      </section>

      {/* What It Is */}
      <section className="py-14 border-t border-gray-800/70 bg-gray-950/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold mb-4">What is Study Coordinator Pro?</h2>
          <p className="text-gray-300 max-w-3xl">
            Study Coordinator Pro is a streamlined application designed to support daily coordinator tasks. The current build focuses on accurate visit scheduling and windows, investigational product compliance calculations, and lab kit management &mdash; with simple analytics to keep teams informed.
          </p>
        </div>
      </section>

      {/* Core Capabilities (based on current build) */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-xl font-semibold text-gray-200 mb-6">Core Capabilities in This Build</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
              <div className="text-blue-400 font-semibold mb-2">Visit Scheduling & Windows</div>
              <p className="text-sm text-gray-300">
                Plan protocol visits from an anchor date with clear windows. Day math and display are timezone-safe for consistent dates across sites.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
              <div className="text-emerald-400 font-semibold mb-2">IP Compliance Calculations</div>
              <p className="text-sm text-gray-300">
                Calculate expected dosing windows and adherence percentages based on protocol dosing frequency and visit timing.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
              <div className="text-purple-400 font-semibold mb-2">Lab Kit Management</div>
              <p className="text-sm text-gray-300">
                Maintain inventory and statuses (including shipped/delivered), surface expiring kits, and plan needs aligned with upcoming visits.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
              <div className="text-sky-300 font-semibold mb-2">Intelligent Lab Kit Forecasting</div>
              <p className="text-sm text-gray-300">
                Forecast kit demand from upcoming schedules and windows to support ordering and reduce waste from expirations.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
              <div className="text-yellow-300 font-semibold mb-2">Subject Timelines</div>
              <p className="text-sm text-gray-300">
                Visualize each subject&apos;s planned targets, actuals, and windows to support scheduling and monitoring.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
              <div className="text-cyan-300 font-semibold mb-2">Study & Site Access</div>
              <p className="text-sm text-gray-300">
                Organize by study and site membership. Manage schedules and visits within your assigned studies.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
              <div className="text-pink-300 font-semibold mb-2">Operational Analytics</div>
              <p className="text-sm text-gray-300">
                High-level indicators for timing and activity to help identify upcoming work and out-of-window items.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Principles & Status */}
      <section className="py-14 border-t border-gray-800/70 bg-gray-950/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-xl font-semibold mb-3">Design Principles</h3>
            <ul className="text-gray-300 text-sm space-y-2 list-disc list-inside">
              <li>Clinical clarity over marketing: concise, accurate views</li>
              <li>Calendar-day accuracy across timezones (UTC-safe day math)</li>
              <li>No PHI stored in the application; anonymized data only</li>
              <li>Minimal steps to plan, schedule, and reconcile</li>
            </ul>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-3">Status</h3>
            <ul className="text-gray-300 text-sm space-y-2 list-disc list-inside">
              <li>Private preview &mdash; not publicly launched</li>
              <li>Focused on visit planning, IP compliance calculations, lab kits</li>
              <li>Authentication required; access limited to invited users</li>
            </ul>
            <div className="mt-4">
              <Link href="/login" className="inline-block text-sm px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-750">
                Sign in to preview
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/70 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-400">
          <div className="mb-2">&copy; {new Date().getFullYear()} Study Coordinator Pro</div>
          <div className="text-xs">Internal preview &middot; Not for production use</div>
        </div>
      </footer>
    </main>
  )
}
