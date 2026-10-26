import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Stats = {
  total: number; pending: number; verified: number; assigned: number;
  in_progress: number; resolved: number; rejected: number; duplicate: number;
  avg_resolution_hours: number | null;
}

export default async function DashboardOverviewPage() {
  const supabase = await createClient()

  const [statsRes, recentRes] = await Promise.all([
    supabase.rpc('get_complaint_stats'),
    supabase
      .from('complaints')
      .select('id, damage_type, complaint_status, address_label, created_at, latitude, longitude')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const stats: Stats = statsRes.data?.[0] ?? {
    total: 0, pending: 0, verified: 0, assigned: 0,
    in_progress: 0, resolved: 0, rejected: 0, duplicate: 0, avg_resolution_hours: null,
  }

  const recent = recentRes.data ?? []

  const statusCards = [
    { label: 'Total Reports', value: stats.total, color: 'bg-gray-100 text-gray-800', emoji: '📊' },
    { label: 'Pending Review', value: stats.pending, color: 'bg-amber-50 text-amber-700', emoji: '⏳' },
    { label: 'Verified', value: stats.verified, color: 'bg-blue-50 text-blue-700', emoji: '✅' },
    { label: 'Assigned', value: stats.assigned, color: 'bg-purple-50 text-purple-700', emoji: '👷' },
    { label: 'In Progress', value: stats.in_progress, color: 'bg-orange-50 text-orange-700', emoji: '🔧' },
    { label: 'Resolved', value: stats.resolved, color: 'bg-green-50 text-green-700', emoji: '🏁' },
    { label: 'Rejected', value: stats.rejected, color: 'bg-red-50 text-red-700', emoji: '❌' },
    { label: 'Duplicates', value: stats.duplicate, color: 'bg-gray-50 text-gray-600', emoji: '🔗' },
  ]

  const statusColors: Record<string, string> = {
    pending_verification: 'bg-amber-100 text-amber-700',
    verified: 'bg-blue-100 text-blue-700',
    assigned: 'bg-purple-100 text-purple-700',
    in_progress: 'bg-orange-100 text-orange-700',
    resolved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    duplicate: 'bg-gray-100 text-gray-600',
  }

  const statusLabel = (s: string) => s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
        <p className="text-gray-500 text-sm mt-1">Live complaint statistics</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statusCards.map(card => (
          <div key={card.label} className={`rounded-xl p-4 ${card.color} border border-black/5`}>
            <div className="text-2xl mb-1">{card.emoji}</div>
            <div className="text-3xl font-bold">{card.value}</div>
            <div className="text-sm font-medium mt-1 opacity-80">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Avg resolution time */}
      {stats.avg_resolution_hours !== null && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 inline-flex items-center gap-3">
          <span className="text-2xl">⏱️</span>
          <div>
            <p className="text-sm text-green-700 font-medium">Average Resolution Time</p>
            <p className="text-xl font-bold text-green-800">
              {stats.avg_resolution_hours.toFixed(1)} hours
            </p>
          </div>
        </div>
      )}

      {/* Recent complaints */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Recent Complaints</h3>
          <a href="/dashboard/complaints" className="text-sm text-green-700 hover:text-green-900 font-medium">
            View all →
          </a>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Location</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recent.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                    #{(c.id as string).slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-800 font-medium">
                    {(c.damage_type as string).replace('_', ' ')}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                    {c.address_label || `${(c.latitude as number).toFixed(4)}, ${(c.longitude as number).toFixed(4)}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColors[c.complaint_status as string] ?? 'bg-gray-100 text-gray-600'}`}>
                      {statusLabel(c.complaint_status as string)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(c.created_at as string).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <a href={`/dashboard/complaints/${c.id}`} className="text-green-700 hover:text-green-900 font-medium text-xs">
                      Review →
                    </a>
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No complaints yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
