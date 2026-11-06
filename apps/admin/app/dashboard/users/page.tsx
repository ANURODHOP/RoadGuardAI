import { createAdminClient } from '@/lib/supabase-server'
import {
  Users,
  ShieldCheck,
  Search,
  Filter,
  UserCheck,
  Calendar,
  Phone,
  FileText,
  ChevronLeft,
  ChevronRight,
  Shield,
  User
} from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    role?: string
    search?: string
    page?: string
  }>
}

export default async function UsersDirectoryPage({ searchParams }: PageProps) {
  const { role, search, page } = await searchParams
  const currentPage = Math.max(1, parseInt(page || '1', 10))
  const pageSize = 15
  const from = (currentPage - 1) * pageSize
  const to = from + pageSize - 1

  const supabase = await createAdminClient()

  // Base query
  let query = supabase
    .from('profiles')
    .select(
      `
      id,
      display_name,
      role,
      phone,
      avatar_url,
      created_at,
      complaints!reporter_id (count)
    `,
      { count: 'exact' }
    )

  if (role && role !== 'ALL') {
    query = query.eq('role', role)
  }

  if (search && search.trim()) {
    query = query.or(`display_name.ilike.%${search.trim()}%,id.ilike.%${search.trim()}%`)
  }

  const { data: profiles, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  const totalUsers = count || 0
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize))

  // Fetch summary counts for top cards
  const { count: adminCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')

  const { count: modCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'moderator')

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Personnel & Citizen Directory</h2>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
              Access Control
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">
            Registered citizen reporters, municipal inspectors, and platform administrators
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-xs text-xs">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold text-slate-800">{adminCount || 0}</span>
            <span className="text-slate-500">Administrators</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-xs text-xs">
            <Users className="h-4 w-4 text-slate-500" />
            <span className="font-semibold text-slate-800">{totalUsers}</span>
            <span className="text-slate-500">Total Registered</span>
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <form method="GET" className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              name="search"
              defaultValue={search || ''}
              placeholder="Search by display name or UUID..."
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="h-3.5 w-3.5" />
              <select
                name="role"
                defaultValue={role || 'ALL'}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="ALL">All Roles</option>
                <option value="admin">Administrator</option>
                <option value="moderator">Moderator</option>
                <option value="user">Citizen User</option>
              </select>
            </div>

            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors shadow-xs"
            >
              Filter
            </button>

            {(role || search) && (
              <Link
                href="/dashboard/users"
                className="px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 underline transition-colors"
              >
                Clear
              </Link>
            )}
          </div>
        </form>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/70 text-slate-500 uppercase tracking-wider font-semibold text-[11px]">
              <tr>
                <th className="px-5 py-3.5">User Identity</th>
                <th className="px-4 py-3.5">Assigned Role</th>
                <th className="px-4 py-3.5">Contact</th>
                <th className="px-4 py-3.5 text-center">Incidents Reported</th>
                <th className="px-4 py-3.5">Joined Date</th>
                <th className="px-5 py-3.5 text-right">Account Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profiles && profiles.length > 0 ? (
                profiles.map((user: any) => {
                  const reportsCount = user.complaints?.[0]?.count ?? 0
                  const isAdmin = user.role === 'admin'
                  const isMod = user.role === 'moderator'

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Identity */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold ${
                            isAdmin
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : isMod
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {user.display_name ? user.display_name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">
                              {user.display_name || 'Anonymous User'}
                            </div>
                            <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                              ID: {user.id.slice(0, 16)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5">
                        {isAdmin ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                            <Shield className="h-3 w-3" />
                            Administrator
                          </span>
                        ) : isMod ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-200">
                            <UserCheck className="h-3 w-3" />
                            Moderator
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">
                            <User className="h-3 w-3" />
                            Citizen Reporter
                          </span>
                        )}
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3.5 text-slate-600">
                        {user.phone ? (
                          <span className="flex items-center gap-1.5 font-mono text-[11px]">
                            <Phone className="h-3 w-3 text-slate-400" />
                            {user.phone}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">None recorded</span>
                        )}
                      </td>

                      {/* Incidents Reported */}
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono font-semibold text-xs ${
                          reportsCount > 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          <FileText className="h-3 w-3" />
                          {reportsCount}
                        </span>
                      </td>

                      {/* Joined Date */}
                      <td className="px-4 py-3.5 text-slate-600 font-mono text-[11px]">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          {new Date(user.created_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </td>

                      {/* Account Status */}
                      <td className="px-5 py-3.5 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    <Users className="mx-auto h-8 w-8 mb-2 stroke-1" />
                    <p className="text-sm font-medium text-slate-700">No personnel or users found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      No accounts matched your current query criteria.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Server-side Pagination footer */}
        <div className="h-12 border-t border-slate-200 bg-slate-50/50 px-5 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-800">{profiles?.length || 0}</span> of{' '}
            <span className="font-semibold text-slate-800">{totalUsers}</span> users
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/users?page=${currentPage - 1}${role ? `&role=${role}` : ''}${search ? `&search=${search}` : ''}`}
              className={`flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium shadow-xs transition-colors ${
                currentPage <= 1
                  ? 'pointer-events-none opacity-40 text-slate-300'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </Link>

            <span className="px-2 font-mono text-[11px] text-slate-600">
              Page {currentPage} of {totalPages}
            </span>

            <Link
              href={`/dashboard/users?page=${currentPage + 1}${role ? `&role=${role}` : ''}${search ? `&search=${search}` : ''}`}
              className={`flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium shadow-xs transition-colors ${
                currentPage >= totalPages
                  ? 'pointer-events-none opacity-40 text-slate-300'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
