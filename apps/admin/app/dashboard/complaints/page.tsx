'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import Link from 'next/link'

const STATUS_OPTIONS = ['all', 'pending_verification', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected', 'duplicate']

const STATUS_COLORS: Record<string, string> = {
  pending_verification: 'bg-amber-100 text-amber-700',
  verified: 'bg-blue-100 text-blue-700',
  assigned: 'bg-purple-100 text-purple-700',
  in_progress: 'bg-orange-100 text-orange-700',
  resolved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  duplicate: 'bg-gray-100 text-gray-600',
}

const statusLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

export default function ComplaintsListPage() {
  const [complaints, setComplaints] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadComplaints()
  }, [])

  const loadComplaints = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('complaints')
      .select('id, damage_type, complaint_status, verification_status, address_label, latitude, longitude, created_at, detection_confidence, reporter_id')
      .order('created_at', { ascending: false })
      .limit(500)
    setComplaints(data ?? [])
    setFiltered(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    let result = complaints
    if (statusFilter !== 'all') {
      result = result.filter(c => c.complaint_status === statusFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.id.toLowerCase().includes(q) ||
        c.damage_type?.toLowerCase().includes(q) ||
        c.address_label?.toLowerCase().includes(q)
      )
    }
    setFiltered(result)
  }, [statusFilter, search, complaints])

  const exportCSV = () => {
    const headers = ['ID', 'Damage Type', 'Status', 'Verification', 'Location', 'Confidence', 'Date']
    const rows = filtered.map(c => [
      c.id,
      c.damage_type,
      c.complaint_status,
      c.verification_status,
      c.address_label || `${c.latitude},${c.longitude}`,
      c.detection_confidence != null ? Math.round(c.detection_confidence * 100) + '%' : '',
      new Date(c.created_at).toLocaleDateString(),
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'roadguard_complaints.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Complaints</h2>
          <p className="text-gray-500 text-sm">{filtered.length} of {complaints.length} shown</p>
        </div>
        <button
          onClick={exportCSV}
          className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by ID, type, or location..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-800 flex-1 min-w-[240px] focus:outline-none focus:ring-2 focus:ring-green-600"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s === 'all' ? 'All Statuses' : statusLabel(s)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading complaints...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 w-24">ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Location</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">AI Conf.</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                      #{c.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3 capitalize font-medium text-gray-800">
                      {c.damage_type?.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                      {c.address_label || `${Number(c.latitude).toFixed(4)}, ${Number(c.longitude).toFixed(4)}`}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[c.complaint_status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {statusLabel(c.complaint_status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.detection_confidence != null
                        ? `${Math.round(c.detection_confidence * 100)}%`
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/complaints/${c.id}`}
                        className="text-green-700 hover:text-green-900 font-medium text-xs whitespace-nowrap"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      No complaints match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
