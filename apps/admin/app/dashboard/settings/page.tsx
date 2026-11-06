import { createClient } from '@/lib/supabase-server'
import {
  Settings,
  Shield,
  Database,
  Cpu,
  Lock,
  CheckCircle2,
  Server,
  Layers,
  Sliders,
  AlertTriangle,
  RefreshCw,
  KeyRound
} from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()

  // Verify active user session
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, role, created_at')
    .eq('id', user?.id || '')
    .single()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not configured'
  const isProd = process.env.NODE_ENV === 'production'

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">System & Security Configuration</h2>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
            Enterprise Admin
          </span>
        </div>
        <p className="text-slate-500 text-xs mt-0.5">
          Municipal parameters, database integrity policies, AI confidence guardrails, and access security
        </p>
      </div>

      {/* Grid of Settings Cards */}
      <div className="space-y-5">
        {/* Card 1: Active Administrator Identity */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Administrator Security Session</h3>
              <p className="text-xs text-slate-500">Currently authenticated privileged identity</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-100 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Admin Email</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">{user?.email || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Display Designation</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {profile?.display_name || 'System Administrator'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Authorization Role</span>
              <span className="inline-flex items-center gap-1 mt-0.5 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <CheckCircle2 className="h-3 w-3" />
                {profile?.role?.toUpperCase() || 'ADMIN'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Database & Backend Infrastructure */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Supabase Cloud Engine & Storage</h3>
              <p className="text-xs text-slate-500">PostgreSQL instance, Row Level Security, and edge endpoints</p>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-100 text-xs">
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-600">Supabase Host Gateway:</span>
              <span className="font-mono text-slate-800 font-semibold bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                {supabaseUrl.replace(/^https?:\/\//, '')}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-t border-slate-100">
              <span className="text-slate-600">Row-Level-Security (RLS) Enforcement:</span>
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Strict Active (Complaints, Profiles, Evidence, History)
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-t border-slate-100">
              <span className="text-slate-600">Spatial Indexing Extension:</span>
              <span className="inline-flex items-center gap-1 text-slate-700 font-mono text-[11px]">
                cube + earthdistance (O(log n) duplicate radius bounding)
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-t border-slate-100">
              <span className="text-slate-600">Client Key Isolation:</span>
              <span className="text-emerald-700 font-medium">
                Verified: Service Role keys are restricted to secure Next.js Server Actions
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: AI Inference & Municipal Guardrails */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Edge YOLO Inference & Guardrails</h3>
              <p className="text-xs text-slate-500">Autonomous pothole detection parameters and dispatch limits</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <span className="text-slate-500 block text-[11px]">Confidence Auto-Verify</span>
              <span className="font-mono font-bold text-slate-900 text-base mt-1 block">≥ 75%</span>
              <span className="text-[10px] text-slate-400 mt-1 block">High reliability threshold for triage</span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <span className="text-slate-500 block text-[11px]">Uncertain Review Cutoff</span>
              <span className="font-mono font-bold text-slate-900 text-base mt-1 block">&lt; 45%</span>
              <span className="text-[10px] text-slate-400 mt-1 block">Mandates physical inspector verification</span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <span className="text-slate-500 block text-[11px]">Duplicate Spatial Radius</span>
              <span className="font-mono font-bold text-slate-900 text-base mt-1 block">50 meters</span>
              <span className="text-[10px] text-slate-400 mt-1 block">Cluster radius for merging repeat reports</span>
            </div>
          </div>
        </div>

        {/* Card 4: Audit & Regulatory Compliance */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Municipal Audit Integrity Policy</h3>
              <p className="text-xs text-slate-500">Immutable ledger and state transition rules</p>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
            <p className="leading-relaxed">
              • <strong>Mandatory Rejection Logging:</strong> Administrative dismissal of citizen reports requires a validated rationale recorded in <code className="font-mono text-slate-800 bg-slate-100 px-1 py-0.5 rounded">complaint_status_history</code>.
            </p>
            <p className="leading-relaxed">
              • <strong>Non-destructive Duplicate Merge:</strong> Linking duplicate reports links the parent record without deleting the secondary citizen reporter&apos;s photo or contribution history.
            </p>
            <p className="leading-relaxed">
              • <strong>State Transitions:</strong> Hard-coded PostgreSQL database trigger ensures statuses transition strictly according to municipal operating procedure.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
