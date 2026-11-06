import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  SlidersHorizontal,
  MapPin,
  Calendar,
  X
} from 'lucide-react'
import { StatusBadge, ComplaintStatus } from '@/components/StatusBadge'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const STATUS_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'All Complaints', value: 'all' },
  { label: 'Pending Review', value: 'pending_verification' },
  { label: 'Verified', value: 'verified' },
  { label: 'Assigned', value: 'assigned' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Duplicates', value: 'duplicate' },
]

const DAMAGE_TYPES = ['all', 'pothole', 'crack', 'subsidence', 'other']

interface Props {
  searchParams: Promise<{
    page?: string
    status?: string
    damage?: string
    q?: string
    sort?: string
  }>
}

export default async function ComplaintsListPage({ searchParams }: Props) {
  const supabase = await createClient()

  // Auth verification
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'moderator'].includes(profile.role)) redirect('/')

  // Parse parameters
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const status = params.status && params.status !== 'all' ? params.status : null
  const damage = params.damage && params.damage !== 'all' ? params.damage : null
  const search = params.q?.trim() || null
  const sortAsc = params.sort === 'asc'

  // Build query
  let query = supabase
    .from('complaints')
    .select(
      'id, damage_type, complaint_status, verification_status, address_label, latitude, longitude, created_at, detection_confidence, description',
      { count: 'exact' }
    )
    .order('created_at', { ascending: sortAsc })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (status) {
    query = query.eq('complaint_status', status)
  }
  if (damage) {
    query = query.eq('damage_type', damage)
  }
  if (search) {
    query = query.or(`address_label.ilike.%${search}%,damage_type.ilike.%${search}%,id.ilike.%${search}%`)
  }

  const { data: complaints, count, error } = await query

  if (error) {
    console.error('[Admin] Complaints query error:', error.message)
  }

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rows = complaints ?? []

  // Pagination helper
  const pageUrl = (p: number) => {
    const ps = new URLSearchParams()
    ps.set('page', String(p))
    if (status) ps.set('status', status)
    if (damage) ps.set('damage', damage)
    if (search) ps.set('q', search)
    if (params.sort) ps.set('sort', params.sort)
    return `/dashboard/complaints?${ps.toString()}`
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Complaint Incident Registry
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">
              {totalCount} total cases
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Browse, filter, inspect, and manage municipal road damage reports.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/dashboard/map"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
          >
            <MapPin className="h-3.5 w-3.5 text-slate-500" />
            <span>Map View</span>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
        {/* Status Tab Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {STATUS_FILTERS.map((f) => {
            const isSelected = (!status && f.value === 'all') || status === f.value
            const ps = new URLSearchParams()
            ps.set('page', '1')
            if (f.value !== 'all') ps.set('status', f.value)
            if (damage) ps.set('damage', damage)
            if (search) ps.set('q', search)
            return (
              <Link
                key={f.value}
                href={`/dashboard/complaints?${ps.toString()}`}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {f.label}
              </Link>
            )
          })}
        </div>

        {/* Detailed Controls Row (Search + Damage Filter + Sort) */}
        <form method="get" className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-slate-100">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              name="q"
              defaultValue={search || ''}
              placeholder="Search by address, description, or Case ID..."
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
            />
            {search && (
              <a
                href={pageUrl(1).replace(/&?q=[^&]*/, '')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Damage category filter */}
            <select
              name="damage"
              defaultValue={damage || 'all'}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-600 font-medium"
            >
              <option value="all">All Damage Types</option>
              <option value="pothole">Pothole</option>
              <option value="crack">Crack</option>
              <option value="subsidence">Subsidence</option>
              <option value="other">Other</option>
            </select>

            {/* Sort order */}
            <select
              name="sort"
              defaultValue={params.sort || 'desc'}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-600 font-medium"
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>

            {/* Preserve current status */}
            {status && <input type="hidden" name="status" value={status} />}
            <input type="hidden" name="page" value="1" />

            <button
              type="submit"
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors shrink-0"
            >
              Apply Filter
            </button>
          </div>
        </form>
      </div>

      {/* Complaints Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3.5">Case Reference</th>
                <th className="px-4 py-3.5">Damage Classification</th>
                <th className="px-4 py-3.5">Geographic Location</th>
                <th className="px-4 py-3.5">Workflow Status</th>
                <th className="px-4 py-3.5">AI Confidence</th>
                <th className="px-4 py-3.5">Report Date</th>
                <th className="px-5 py-3.5 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <ClipboardList className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-medium text-slate-600 text-sm">No complaints found</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or search terms.</p>
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-900">
                      #{c.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="capitalize font-semibold text-slate-800">
                        {c.damage_type || 'Pothole'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 max-w-[240px]">
                      <div className="truncate font-medium text-slate-700">
                        {c.address_label || `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        GPS: {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={c.complaint_status} size="sm" />
                    </td>
                    <td className="px-4 py-3.5 font-mono">
                      {c.detection_confidence ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-emerald-600 h-1.5 rounded-full"
                              style={{ width: `${Math.round(c.detection_confidence * 100)}%` }}
                            />
                          </div>
                          <span className="text-slate-700 font-semibold text-[11px]">
                            {Math.round(c.detection_confidence * 100)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Manual</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                      {new Date(c.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <Link
                        href={`/dashboard/complaints/${c.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 text-xs shadow-2xs transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5 text-slate-400" />
                        <span>Inspect</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              Showing <span className="font-semibold text-slate-900">{(page - 1) * PAGE_SIZE + 1}</span> to{' '}
              <span className="font-semibold text-slate-900">
                {Math.min(page * PAGE_SIZE, totalCount)}
              </span>{' '}
              of <span className="font-semibold text-slate-900">{totalCount}</span> cases
            </div>

            <div className="flex items-center gap-1">
              {page > 1 ? (
                <Link
                  href={pageUrl(page - 1)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 font-medium text-slate-700 shadow-2xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-100 text-slate-300 font-medium cursor-not-allowed">
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </span>
              )}

              <span className="px-3 py-1 text-slate-700 font-medium">
                Page {page} of {totalPages}
              </span>

              {page < totalPages ? (
                <Link
                  href={pageUrl(page + 1)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 font-medium text-slate-700 shadow-2xs"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-100 text-slate-300 font-medium cursor-not-allowed">
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
