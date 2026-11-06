import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  UserCheck,
  Wrench,
  ShieldCheck,
  XCircle,
  Copy,
  ArrowUpRight,
  MapPin,
  TrendingUp,
  Activity,
  Layers,
  Sparkles
} from 'lucide-react'
import { KpiCard } from '@/components/KpiCard'
import { StatusBadge } from '@/components/StatusBadge'

export const dynamic = 'force-dynamic'

type Stats = {
  total: number
  pending: number
  verified: number
  assigned: number
  in_progress: number
  resolved: number
  rejected: number
  duplicate: number
  avg_resolution_hours: number | null
}

export default async function DashboardOverviewPage() {
  const supabase = await createClient()

  // Parallel fetch real operational metrics
  const [statsRes, recentRes, damageBreakdownRes, historyRes] = await Promise.all([
    supabase.rpc('get_complaint_stats'),
    supabase
      .from('complaints')
      .select('id, damage_type, complaint_status, address_label, created_at, latitude, longitude, detection_confidence')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('complaints')
      .select('damage_type')
      .not('complaint_status', 'eq', 'rejected'),
    supabase
      .from('complaint_status_history')
      .select('id, complaint_id, old_status, new_status, note, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const stats: Stats = statsRes.data?.[0] ?? {
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

  const recent = recentRes.data ?? []
  const history = historyRes.data ?? []

  // Compute damage breakdown from real data
  const damageCounts: Record<string, number> = {
    pothole: 0,
    crack: 0,
    subsidence: 0,
    other: 0,
  }
  ;(damageBreakdownRes.data ?? []).forEach((row) => {
    const type = row.damage_type?.toLowerCase() || 'other'
    damageCounts[type] = (damageCounts[type] || 0) + 1
  })

  const totalActive = Object.values(damageCounts).reduce((a, b) => a + b, 0)
  const resolutionRate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0

  return (
    <div className="space-y-8">
      {/* Page Title & Operational Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Operations Command Overview
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time municipal road condition telemetry, verification triage, and case resolution.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/map"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-xs"
          >
            <MapPin className="h-3.5 w-3.5 text-slate-500" />
            <span>Map Telemetry</span>
          </Link>
          <Link
            href="/dashboard/complaints?status=pending_verification"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors shadow-xs"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Review Queue ({stats.pending})</span>
          </Link>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total Incidents"
          value={stats.total}
          subtext="Total citizens reports logged"
          icon={ClipboardList}
        />
        <KpiCard
          label="Pending Review"
          value={stats.pending}
          subtext="Requires administrator triage"
          icon={Clock}
          badge={{ text: 'Action Needed', variant: 'warning' }}
          highlight={stats.pending > 0}
        />
        <KpiCard
          label="Active In Progress"
          value={stats.in_progress + stats.assigned}
          subtext={`${stats.assigned} assigned, ${stats.in_progress} underway`}
          icon={Wrench}
          badge={{ text: 'Repairing', variant: 'info' }}
        />
        <KpiCard
          label="Resolved Cases"
          value={stats.resolved}
          subtext={`${resolutionRate}% municipal resolution rate`}
          icon={ShieldCheck}
          badge={{ text: `${resolutionRate}%`, variant: 'success' }}
        />
      </div>

      {/* Secondary Metrics / Performance Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Resolution Benchmark Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Avg Resolution Speed
            </span>
            <Activity className="h-4 w-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900">
              {stats.avg_resolution_hours !== null
                ? stats.avg_resolution_hours.toFixed(1)
                : '—'}
            </span>
            <span className="text-xs font-medium text-slate-500">hours from verification</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Measures timestamp delta between verified triage and verified resolution.
          </p>
        </div>

        {/* Damage Classification Breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Damage Category Breakdown
            </span>
            <Layers className="h-4 w-4 text-slate-400" />
          </div>
          <div className="space-y-2 mt-2">
            {[
              { label: 'Pothole', count: damageCounts.pothole, color: 'bg-emerald-600' },
              { label: 'Crack', count: damageCounts.crack, color: 'bg-sky-600' },
              { label: 'Subsidence', count: damageCounts.subsidence, color: 'bg-amber-600' },
              { label: 'Other', count: damageCounts.other, color: 'bg-slate-400' },
            ].map((item) => {
              const pct = totalActive > 0 ? Math.round((item.count / totalActive) * 100) : 0
              return (
                <div key={item.label} className="text-xs">
                  <div className="flex justify-between font-medium text-slate-700 mb-1">
                    <span>{item.label}</span>
                    <span className="text-slate-500">{item.count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className={`${item.color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Case Status Pipeline */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Case Workflow Status
              </span>
              <TrendingUp className="h-4 w-4 text-slate-400" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">Verified</span>
                <span className="text-lg font-bold text-slate-900">{stats.verified}</span>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">Assigned</span>
                <span className="text-lg font-bold text-slate-900">{stats.assigned}</span>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">Rejected</span>
                <span className="text-lg font-bold text-slate-900">{stats.rejected}</span>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                <span className="text-[11px] text-slate-400 block font-medium">Duplicates</span>
                <span className="text-lg font-bold text-slate-900">{stats.duplicate}</span>
              </div>
            </div>
          </div>
          <Link
            href="/dashboard/analytics"
            className="mt-3 text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center justify-between pt-2 border-t border-slate-100"
          >
            <span>Detailed Analytics Report</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Main Tables Row: Recent Complaints + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Complaints Table (2/3 col) */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Recent Incident Reports</h2>
                <p className="text-[11px] text-slate-500">Latest field reports captured by citizens and offline AI</p>
              </div>
              <Link
                href="/dashboard/complaints"
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                <span>View All Cases</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                    <th className="px-5 py-3">Case ID</th>
                    <th className="px-4 py-3">Damage Type</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Reported</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        No incident complaints recorded yet.
                      </td>
                    </tr>
                  ) : (
                    recent.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3 font-mono font-semibold text-slate-900">
                          #{c.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-4 py-3">
                          <span className="capitalize font-medium text-slate-800">
                            {c.damage_type || 'Pothole'}
                          </span>
                          {c.detection_confidence && (
                            <span className="ml-1.5 text-[10px] text-slate-400 font-mono">
                              ({Math.round(c.detection_confidence * 100)}%)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[200px] truncate text-slate-600">
                          {c.address_label || `${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={c.complaint_status} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                          {new Date(c.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/dashboard/complaints/${c.id}`}
                            className="font-semibold text-emerald-700 hover:text-emerald-800 text-[11px]"
                          >
                            Inspect →
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Recent Admin Audit History (1/3 col) */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-sm font-bold text-slate-900">Administrative Audit Trail</h2>
              <p className="text-[11px] text-slate-500">Live log of status updates & verifications</p>
            </div>

            <div className="space-y-4">
              {history.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  No administrative actions logged yet.
                </p>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="flex gap-3 text-xs">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      <Activity className="h-3 w-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link
                          href={`/dashboard/complaints/${h.complaint_id}`}
                          className="font-mono font-semibold text-slate-900 hover:text-emerald-700"
                        >
                          #{h.complaint_id.slice(0, 6)}
                        </Link>
                        <span className="text-slate-400">→</span>
                        <StatusBadge status={h.new_status} size="sm" showIcon={false} />
                      </div>
                      {h.note && (
                        <p className="mt-1 text-[11px] text-slate-600 line-clamp-1 italic">
                          "{h.note}"
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(h.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 text-center">
            All transitions authenticated & logged
          </div>
        </div>
      </div>
    </div>
  )
}
