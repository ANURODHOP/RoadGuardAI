import { createClient } from '@/lib/supabase-server'
import {
  BarChart3,
  TrendingUp,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Cpu,
  Layers,
  CheckCircle2,
  Calendar,
  Activity,
  FileText
} from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const supabase = await createClient()

  // Fetch real analytics queries
  const [statsRes, damageRes, confRes, recentHistoryRes] = await Promise.all([
    supabase.rpc('get_complaint_stats'),
    // Real damage distribution
    supabase
      .from('complaints')
      .select('damage_type')
      .then(async ({ data }) => {
        const dist: Record<string, number> = {}
        ;(data ?? []).forEach((r) => {
          const t = r.damage_type || 'unclassified'
          dist[t] = (dist[t] || 0) + 1
        })
        return dist
      }),
    // Real AI confidence tiers
    supabase
      .from('complaints')
      .select('detection_confidence')
      .then(async ({ data }) => {
        let high = 0,
          medium = 0,
          low = 0,
          none = 0
        ;(data ?? []).forEach((r) => {
          const c = r.detection_confidence
          if (c == null) none++
          else if (c >= 0.75) high++
          else if (c >= 0.45) medium++
          else low++
        })
        return { high, medium, low, none }
      }),
    // Recent audit events for velocity
    supabase
      .from('complaint_status_history')
      .select('id, new_status, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const stats = statsRes.data?.[0] ?? {
    total: 0,
    pending: 0,
    verified: 0,
    assigned: 0,
    in_progress: 0,
    resolved: 0,
    rejected: 0,
    duplicate: 0,
    avg_resolution_hours: null,
  }

  const damageDistribution = damageRes
  const { high: highConf, medium: mediumConf, low: lowConf, none: noConf } = confRes
  const resolutionRate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0
  const activeBacklog = stats.pending + stats.verified + stats.assigned + stats.in_progress
  const recentTransitions = recentHistoryRes.data || []

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Performance Analytics & Insights</h2>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
              Operational Telemetry
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">
            Real-time municipal resolution efficiency, AI offline classification accuracy, and damage demographics
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-xs text-xs">
            <Activity className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold text-slate-800">{stats.total}</span>
            <span className="text-slate-500">Total Cases Logged</span>
          </div>
        </div>
      </div>

      {/* Top Metric Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Resolution Rate */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-400">
              Resolution Efficiency
            </span>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{resolutionRate}%</span>
            <span className="text-xs text-slate-500">closed successfully</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: `${resolutionRate}%` }} />
          </div>
          <p className="text-[11px] text-slate-400 mt-2.5">
            {stats.resolved} of {stats.total} municipal reports resolved
          </p>
        </div>

        {/* Card 2: Active Backlog */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-400">
              Active Casework Backlog
            </span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{activeBacklog}</span>
            <span className="text-xs text-slate-500">cases in flight</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="bg-amber-500 h-1.5 rounded-full"
              style={{ width: stats.total > 0 ? `${(activeBacklog / stats.total) * 100}%` : '0%' }}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-2.5">
            {stats.pending} pending initial engineer review
          </p>
        </div>

        {/* Card 3: Average Turnaround */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-400">
              Average Repair Turnaround
            </span>
            <TrendingUp className="h-4 w-4 text-slate-700" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {stats.avg_resolution_hours ? `${stats.avg_resolution_hours.toFixed(1)}h` : 'N/A'}
            </span>
            <span className="text-xs text-slate-500">from report to fix</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-4">
            Calculated across verified and resolved cases
          </p>
        </div>

        {/* Card 4: Duplicate Deduplication */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-400">
              Deduplication Rate
            </span>
            <Layers className="h-4 w-4 text-slate-500" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {stats.total > 0 ? Math.round((stats.duplicate / stats.total) * 100) : 0}%
            </span>
            <span className="text-xs text-slate-500">repeat reports merged</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-4">
            {stats.duplicate} duplicate clusters consolidated
          </p>
        </div>
      </div>

      {/* Main Visualizations Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card: Status Distribution */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Lifecycle Status Breakdown</h3>
              <p className="text-[11px] text-slate-500">Distribution across active workflow stages</p>
            </div>
            <FileText className="h-4 w-4 text-slate-400" />
          </div>

          <div className="space-y-3.5">
            {[
              { label: 'Pending Verification', count: stats.pending, color: 'bg-amber-500' },
              { label: 'Verified', count: stats.verified, color: 'bg-sky-500' },
              { label: 'Assigned to Crew', count: stats.assigned, color: 'bg-indigo-500' },
              { label: 'In Progress Repairs', count: stats.in_progress, color: 'bg-amber-600' },
              { label: 'Resolved & Closed', count: stats.resolved, color: 'bg-emerald-600' },
              { label: 'Rejected', count: stats.rejected, color: 'bg-rose-500' },
              { label: 'Duplicates Merged', count: stats.duplicate, color: 'bg-slate-400' },
            ].map((item) => {
              const pct = stats.total > 0 ? Math.round((item.count / stats.total) * 100) : 0
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700">{item.label}</span>
                    <span className="font-mono text-slate-500">
                      {item.count} <span className="text-slate-400">({pct}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className={`${item.color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Card: AI Confidence Guardrail Distribution */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Edge YOLO AI Confidence Distribution</h3>
              <p className="text-[11px] text-slate-500">Offline inference certainty across citizen captures</p>
            </div>
            <Cpu className="h-4 w-4 text-emerald-600" />
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 font-medium">High Confidence (≥ 75%)</span>
                <span className="font-mono font-semibold text-emerald-700">{highConf}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-600 h-1.5 rounded-full"
                  style={{ width: stats.total > 0 ? `${(highConf / stats.total) * 100}%` : '0%' }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 font-medium">Medium Confidence (45% - 74%)</span>
                <span className="font-mono font-semibold text-amber-600">{mediumConf}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-amber-500 h-1.5 rounded-full"
                  style={{ width: stats.total > 0 ? `${(mediumConf / stats.total) * 100}%` : '0%' }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 font-medium">Uncertain / Low Confidence (&lt; 45%)</span>
                <span className="font-mono font-semibold text-rose-600">{lowConf}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-rose-500 h-1.5 rounded-full"
                  style={{ width: stats.total > 0 ? `${(lowConf / stats.total) * 100}%` : '0%' }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 font-medium">Manual / Citizen Submission (No AI model)</span>
                <span className="font-mono font-semibold text-slate-500">{noConf}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-slate-400 h-1.5 rounded-full"
                  style={{ width: stats.total > 0 ? `${(noConf / stats.total) * 100}%` : '0%' }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
            <span>
              <strong>Civic AI Safety Rule:</strong> Reports below 45% confidence are quarantined for mandatory human inspector verification before crew dispatch.
            </span>
          </div>
        </div>
      </div>

      {/* Damage Breakdown & Velocity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Damage Type Classification */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Damage Category Demographics</h3>
              <p className="text-[11px] text-slate-500">Surface defect classifications reported</p>
            </div>
            <Layers className="h-4 w-4 text-slate-400" />
          </div>

          <div className="space-y-3">
            {Object.entries(damageDistribution).map(([type, count]) => {
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
              return (
                <div key={type} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700 capitalize">{type.replace('_', ' ')}</span>
                    <span className="font-mono text-slate-500">
                      {count} <span className="text-slate-400">({pct}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {Object.keys(damageDistribution).length === 0 && (
              <div className="py-8 text-center text-slate-400 text-xs">
                No damage reports recorded in the database yet.
              </div>
            )}
          </div>
        </div>

        {/* Audit Transition Velocity */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Casework Velocity</h3>
              <p className="text-[11px] text-slate-500">Latest administrative state transitions</p>
            </div>
            <Clock className="h-4 w-4 text-slate-400" />
          </div>

          <div className="space-y-2.5">
            {recentTransitions.length > 0 ? (
              recentTransitions.map((ev: any) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50/70 border border-slate-100 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="font-medium text-slate-800 capitalize">
                      Transitioned to {ev.new_status.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">
                    {new Date(ev.created_at).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs">
                No recent workflow transitions recorded.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
