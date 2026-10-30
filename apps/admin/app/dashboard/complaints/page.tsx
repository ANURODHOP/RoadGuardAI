import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const STATUS_OPTIONS = [
  'all', 'pending_verification', 'verified', 'assigned',
  'in_progress', 'resolved', 'rejected', 'duplicate',
]

const STATUS_COLORS: Record<string, string> = {
  pending_verification: 'bg-amber-100 text-amber-700',
  verified:            'bg-blue-100 text-blue-700',
  assigned:            'bg-purple-100 text-purple-700',
  in_progress:         'bg-orange-100 text-orange-700',
  resolved:            'bg-green-100 text-green-700',
  rejected:            'bg-red-100 text-red-700',
  duplicate:           'bg-gray-100 text-gray-600',
}

const statusLabel = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

interface Props {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>
}

export default async function ComplaintsListPage({ searchParams }: Props) {
  const supabase = await createClient()

  // ── Auth guard (belt-and-suspenders beyond layout) ───────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'moderator'].includes(profile.role)) redirect('/')

  // ── Parse search params ─────────────────────────────────────────────────
  const params = await searchParams
  const page   = Math.max(1, parseInt(params.page ?? '1', 10))
  const status = params.status && params.status !== 'all' ? params.status : null
  const search = params.q?.trim() || null

  // ── Server-side paginated query ─────────────────────────────────────────
  let query = supabase
    .from('complaints')
    .select(
      'id, damage_type, complaint_status, verification_status, address_label, latitude, longitude, created_at, detection_confidence',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (status) {
    query = query.eq('complaint_status', status)
  }
  if (search) {
    // Search on address_label (case-insensitive) or partial ID match
    query = query.or(`address_label.ilike.%${search}%,damage_type.ilike.%${search}%`)
  }

  const { data: complaints, count, error } = await query

  if (error) {
    console.error('[Admin] Complaints list error:', error.message)
  }

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rows = complaints ?? []

  // Build pagination URL helper
  const pageUrl = (p: number) => {
    const ps = new URLSearchParams()
    ps.set('page', String(p))
    if (status) ps.set('status', status)
    if (search) ps.set('q', search)
    return `/dashboard/complaints?${ps.toString()}`
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Complaints</h2>
          <p className="text-gray-500 text-sm">
            {totalCount} total · showing page {page} of {totalPages}
          </p>
        </div>
      </div>

      {/* ── Filters (GET form — works without JS) ── */}
      <form method="GET" action="/dashboard/complaints" className="flex flex-wrap gap-3">
        <input
          type="text"
          name="q"
          defaultValue={search ?? ''}
          placeholder="Search by type or location..."
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-800
                     flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-green-600"
        />
        <select
          name="status"
          defaultValue={status ?? 'all'}
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-800
                     focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>
              {s === 'all' ? 'All Statuses' : statusLabel(s)}
            </option>
          ))}
        </select>
        {/* Reset page when filters change */}
        <input type="hidden" name="page" value="1" />
        <button
          type="submit"
          className="px-4 py-2 bg-green-700 text-white text-sm font-medium rounded-lg
                     hover:bg-green-800 transition-colors"
        >
          Filter
        </button>
        {(status || search) && (
          <a
            href="/dashboard/complaints"
            className="px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg
                       hover:bg-gray-50 transition-colors"
          >
            Clear
          </a>
        )}
      </form>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
              {rows.map(c => (
                <tr key={c.id as string} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                    #{(c.id as string).slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-4 py-3 capitalize font-medium text-gray-800">
                    {(c.damage_type as string).replace('_', ' ')}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                    {c.address_label ||
                      `${(c.latitude as number).toFixed(4)}, ${(c.longitude as number).toFixed(4)}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold
                      ${STATUS_COLORS[c.complaint_status as string] ?? 'bg-gray-100 text-gray-600'}`}>
                      {statusLabel(c.complaint_status as string)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.detection_confidence != null
                      ? `${Math.round((c.detection_confidence as number) * 100)}%`
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(c.created_at as string).toLocaleDateString()}
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    {error
                      ? 'Error loading complaints. Please try again.'
                      : 'No complaints match your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination controls ── */}
        {totalPages > 1 && (
          <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between bg-gray-50">
            <span className="text-sm text-gray-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <a
                  href={pageUrl(page - 1)}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg
                             text-gray-600 hover:bg-white transition-colors"
                >
                  ← Prev
                </a>
              )}
              {/* Page number links — show up to 5 around current */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
                return (
                  <a
                    key={p}
                    href={pageUrl(p)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      p === page
                        ? 'bg-green-700 text-white font-semibold'
                        : 'border border-gray-200 text-gray-600 hover:bg-white'
                    }`}
                  >
                    {p}
                  </a>
                )
              })}
              {page < totalPages && (
                <a
                  href={pageUrl(page + 1)}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg
                             text-gray-600 hover:bg-white transition-colors"
                >
                  Next →
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
