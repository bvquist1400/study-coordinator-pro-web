import Link from 'next/link'

const capabilities = [
  {
    title: 'Section-aware visit planning',
    description:
      'Prepare schedules per study section, manage anchor transitions, and review protocol windows directly within the subject timeline.'
  },
  {
    title: 'Consistent timing math',
    description:
      'Day calculations remain aligned across sites so visit targets and compliance assessments stay consistent for distributed teams.'
  },
  {
    title: 'IP compliance calculation',
    description:
      'Capture dispensed and returned dosing, calculate adherence automatically, and maintain an auditable record inside each visit.'
  },
  {
    title: 'Intelligent lab kit forecasting',
    description:
      'Project kit demand by visit requirement, account for buffers, and surface deficits before they affect recruitment or subject care.'
  },
  {
    title: 'Shipments and inventory in sync',
    description:
      'Track kits from order to delivery with shared shipment context, expiring stock visibility, and study-wide controls.'
  },
  {
    title: 'Operational analytics',
    description:
      'Surface overdue visits, timing compliance, and investigational product trends with curated Supabase-backed snapshots.'
  }
]

const workflow = [
  {
    title: 'Plan the schedule',
    description:
      'Configure study sections, visit templates, and window logic before generating subject timelines, including optional unscheduled visits when needed.'
  },
  {
    title: 'Coordinate execution',
    description:
      'Use the visit timeline to reschedule, document completion, and capture dosing accountability while monitoring compliance alerts.'
  },
  {
    title: 'Keep supply ready',
    description:
      'Forecast lab kit demand, manage orders and shipments, and reconcile inventory in dedicated tabs that stay synchronized.'
  }
]

const labKitHighlights = [
  {
    title: 'Forecast by requirement',
    description:
      'Many-to-many visit kit requirements roll up demand and consider pending orders, expiry, and buffers per study.'
  },
  {
    title: 'Orders, shipments, archive',
    description:
      'One workspace ties open orders, in-transit shipments, and archived kits together for audit-friendly reconciliation.'
  },
  {
    title: 'Coordinator quick start',
    description:
      'Inline guidance mirrors the coordinator quick start guide so new team members find the right action fast.'
  }
]

const trustPillars = [
  {
    title: 'Privacy by design',
    description: 'No PHI is stored. Coordinate with anonymized identifiers and redact-sensitive logging in production.'
  },
  {
    title: 'Role-scoped access',
    description: 'Supabase RLS and membership checks protect study-specific routes and data interactions.'
  },
  {
    title: 'Operational guardrails',
    description: 'Reliable timing logic, audit trails for scheduling changes, and structured lab kit workflows reduce protocol drift.'
  }
]

export default function Landing() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="relative overflow-hidden bg-gradient-to-b from-blue-950/70 via-black to-black">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-40 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute top-10 right-[-10rem] h-72 w-72 rounded-full bg-purple-500/10 blur-3xl" />
        </div>

        <header className="relative border-b border-white/5">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 font-semibold tracking-tight">
                SCP
              </div>
              <div>
                <p className="text-sm uppercase tracking-wide text-blue-200/80">Study Coordinator Pro</p>
                <p className="text-xs text-gray-400">Clinical research workflow platform</p>
              </div>
            </div>
            <nav className="hidden items-center gap-6 text-sm text-gray-300 md:flex">
              <a className="transition hover:text-white" href="#capabilities">
                Capabilities
              </a>
              <a className="transition hover:text-white" href="#workflow">
                Workflow
              </a>
              <a className="transition hover:text-white" href="#lab-kits">
                Lab Kits
              </a>
              <a className="transition hover:text-white" href="#trust">
                Guardrails
              </a>
            </nav>
            <div className="flex items-center gap-3">
              <div className="hidden text-xs text-gray-500 sm:block">Private preview</div>
              <Link
                href="/login"
                className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-medium shadow-lg shadow-blue-900/40 transition-colors hover:from-blue-700 hover:to-purple-700"
              >
                Sign in
              </Link>
            </div>
          </div>
        </header>

        <section className="relative px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-5xl flex-col items-start gap-8 text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-widest text-blue-200">
              Purpose-built for clinical research teams
            </span>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl md:text-6xl">
              Operational control for clinical research delivery
            </h1>
            <p className="max-w-3xl text-lg text-gray-300">
              Study Coordinator Pro unifies visit planning, investigational product compliance, and lab kit logistics so coordinators can execute the protocol with the precision sponsors and sites expect.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/login"
                className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 text-sm font-semibold shadow-2xl shadow-blue-900/40 transition-transform hover:scale-[1.01] hover:from-blue-700 hover:to-purple-700"
              >
                Access private preview
              </Link>
              <a
                href="#capabilities"
                className="text-sm font-medium text-gray-300 transition hover:text-white"
              >
                Review capabilities →
              </a>
            </div>
            <div className="grid gap-4 rounded-2xl border border-white/5 bg-white/5 p-6 text-sm text-gray-200 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-200">Visit execution</p>
                <p className="mt-1 font-semibold text-white">Timelines, rescheduling, window oversight</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-200">IP compliance</p>
                <p className="mt-1 font-semibold text-white">Dosing adherence with audit-ready histories</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-200">Supply chain</p>
                <p className="mt-1 font-semibold text-white">Forecasting, orders, shipments, archive</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section id="capabilities" className="border-t border-white/5 bg-gray-950/40 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-3xl">
            <h2 className="text-3xl font-semibold">Map the entire coordinator workflow</h2>
            <p className="mt-3 text-base text-gray-300">
              Each capability reflects the current build. Descriptions align with the live application so coordinators understand what will be available at first sign-in.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {capabilities.map(capability => (
              <div
                key={capability.title}
                className="rounded-2xl border border-white/5 bg-black/40 p-6 shadow-[0_30px_80px_-40px_rgba(37,99,235,0.35)]"
              >
                <h3 className="text-lg font-semibold text-white">{capability.title}</h3>
                <p className="mt-3 text-sm text-gray-300">{capability.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-t border-white/5 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-3xl">
            <div>
            <h2 className="text-3xl font-semibold">How coordinators advance the protocol</h2>
            <p className="mt-3 text-base text-gray-300">
              Study Coordinator Pro mirrors the daily rhythm of the coordination role: plan the study, monitor execution, and keep supply aligned with upcoming visits.
            </p>
          </div>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {workflow.map(step => (
              <div key={step.title} className="rounded-2xl border border-white/5 bg-gray-950/60 p-6">
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="mt-3 text-sm text-gray-300">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="lab-kits" className="border-t border-white/5 bg-gradient-to-b from-gray-950/50 to-black py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-3xl">
            <span className="text-xs uppercase tracking-[0.35em] text-blue-200">Lab kit operations</span>
            <h2 className="mt-2 text-3xl font-semibold">Forecast through fulfillment in a single workspace</h2>
            <p className="mt-4 text-base text-gray-300">
              The lab kit management system follows the coordinator quick start guide: inventory, forecast, orders and shipments, alerts, and archive remain in sync so supply stays predictable.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {labKitHighlights.map(item => (
              <div key={item.title} className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-6">
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm text-blue-50/90">{item.description}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 rounded-2xl border border-white/5 bg-black/60 p-6 text-sm text-gray-300">
            <h3 className="text-base font-semibold text-white">Current lab kit operations in preview</h3>
            <ul className="mt-4 space-y-2">
              <li>• Configurable buffers and per-study overrides remain aligned with Supabase settings.</li>
              <li>• Shipments reference kit inventory so delivered status updates sync immediately across tabs.</li>
              <li>• Recommendation jobs refresh nightly via scheduled recompute to keep deficit guidance current.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="trust" className="border-t border-white/5 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-3xl">
            <h2 className="text-3xl font-semibold">Guardrails embedded in the platform</h2>
            <p className="mt-3 text-base text-gray-300">
              Study Coordinator Pro applies the same guardrails used inside the product itself: privacy, access control, and operational safety.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {trustPillars.map(pillar => (
              <div key={pillar.title} className="rounded-2xl border border-white/5 bg-black/50 p-6">
                <h3 className="text-lg font-semibold text-white">{pillar.title}</h3>
                <p className="mt-3 text-sm text-gray-300">{pillar.description}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-100">
            <h3 className="text-base font-semibold text-white">Privacy notice</h3>
            <p className="mt-2 text-sm">
              This application does not store PHI. Use anonymized identifiers and follow institutional guidelines when adding study data.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 bg-gradient-to-r from-blue-950/50 to-purple-950/40 py-20">
        <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold">Ready to coordinate with confidence?</h2>
          <p className="mt-4 text-base text-gray-200">
            Study Coordinator Pro is currently in private preview. Authorized teams can sign in today while broader availability is prepared.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/login"
              className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 text-sm font-semibold shadow-lg shadow-blue-900/40 transition-transform hover:scale-[1.01] hover:from-blue-700 hover:to-purple-700"
            >
              Sign in to preview
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 text-center text-xs text-gray-500 sm:flex-row sm:justify-between sm:text-left">
          <p>&copy; {new Date().getFullYear()} Study Coordinator Pro. Internal preview.</p>
          <p className="text-xs text-gray-500">Documentation available to preview teams inside the application.</p>
        </div>
      </footer>
    </main>
  )
}
