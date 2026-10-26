import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const supabase = await createClient()

  const [statsRes, complaintsRes] = await Promise.all([
    supabase.rpc('get_complaint_stats'),
    supabase
      .from('complaints')
      .select('damage_type, complaint_status, verification_status, created_at, detection_confidence, resolved_at'),
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

  const complaints = complaintsRes.data ?? []

  // Damage type distribution
  const damageDistribution: Record<string, number> = {}
  complaints.forEach((c) => {
    const type = c.damage_type || 'unclassified'
    damageDistribution[type] = (damageDistribution[type] || 0) + 1
  })

  // Verification status distribution
  const verificationDistribution: Record<string, number> = {}
  complaints.forEach((c) => {
    const v = c.verification_status || 'unverified'
    verificationDistribution[v] = (verificationDistribution[v] || 0) + 1
  })

  // AI Confidence tiers
  let highConf = 0
  let mediumConf = 0
  let lowConf = 0
  let noConf = 0
  complaints.forEach((c) => {
    if (c.detection_confidence == null) {
      noConf++
    } else if (c.detection_confidence >= 0.75) {
      highConf++
    } else if (c.detection_confidence >= 0.45) {
      mediumConf++
    } else {
      lowConf++
    }
  })

  const resolutionRate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0
  const activeBacklog = stats.pending + stats.verified + stats.assigned + stats.in_progress

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Analytics & Insights</h2>
        <p className="text-gray-500 text-sm mt-1">
          System performance, resolution metrics, and damage categorization
        </p>
      </div>

      {/* Top metric highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Resolution Rate</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-green-700">{resolutionRate}%</span>
            <span className="text-xs text-gray-500">of total cases</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-3 overflow-hidden">
            <div className="bg-green-600 h-2 rounded-full" style={{ width: `${resolutionRate}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Backlog</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-amber-600">{activeBacklog}</span>
            <span className="text-xs text-gray-500">in processing</span>
          </div>
          <p className="text-xs text-gray-400 mt-3">{stats.pending} awaiting verification</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Avg Resolution Time</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-blue-700">
              {stats.avg_resolution_hours ? `${stats.avg_resolution_hours.toFixed(1)}h` : 'N/A'}
            </span>
            <span className="text-xs text-gray-500">turnaround</span>
          </div>
          <p className="text-xs text-gray-400 mt-3">From report to verified fix</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Duplicate Filter Rate</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-gray-700">
              {stats.total > 0 ? Math.round((stats.duplicate / stats.total) * 100) : 0}%
            </span>
            <span className="text-xs text-gray-500">prevented re-work</span>
          </div>
          <p className="text-xs text-gray-400 mt-3">{stats.duplicate} duplicate claims merged</p>
        </div>
      </div>

      {/* Breakdowns section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Damage category breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mb-4">Damage Classification Breakdown</h3>
          <div className="space-y-3">
            {Object.entries(damageDistribution).map(([type, count]) => {
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
              return (
                <div key={type} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700 capitalize">{type.replace('_', ' ')}</span>
                    <span className="text-gray-500">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-emerald-600 h-2 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
            {Object.keys(damageDistribution).length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No reports recorded yet.</p>
            )}
          </div>
        </div>

        {/* AI Confidence Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mb-4">Offline YOLO Detection Confidence</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700 font-medium">High Confidence (≥ 75%)</span>
                <span className="font-semibold text-green-700">{highConf}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{ width: stats.total > 0 ? `${(highConf / stats.total) * 100}%` : '0%' }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700 font-medium">Medium Confidence (45% - 74%)</span>
                <span className="font-semibold text-amber-600">{mediumConf}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-amber-500 h-2 rounded-full"
                  style={{ width: stats.total > 0 ? `${(mediumConf / stats.total) * 100}%` : '0%' }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700 font-medium">Uncertain / Low Confidence (&lt; 45%)</span>
                <span className="font-semibold text-orange-600">{lowConf}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-orange-500 h-2 rounded-full"
                  style={{ width: stats.total > 0 ? `${(lowConf / stats.total) * 100}%` : '0%' }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700 font-medium">Manual / Citizen Submission (No AI model)</span>
                <span className="font-semibold text-gray-500">{noConf}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-gray-400 h-2 rounded-full"
                  style={{ width: stats.total > 0 ? `${(noConf / stats.total) * 100}%` : '0%' }}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 p-3 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-500">
            <strong>Civic AI Guardrail:</strong> Low-confidence detections are explicitly tagged as uncertain and require mandatory human inspector verification before any maintenance crew dispatch.
          </div>
        </div>
      </div>
    </div>
  )
}
