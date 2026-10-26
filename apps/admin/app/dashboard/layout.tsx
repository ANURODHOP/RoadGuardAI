import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'moderator'].includes(profile.role)) redirect('/')

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛣️</span>
          <div>
            <h1 className="font-bold text-gray-900 text-lg leading-none">RoadGuard</h1>
            <p className="text-xs text-gray-400 leading-none mt-0.5">Admin Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {profile.display_name || user.email}
            <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold uppercase tracking-wide">
              {profile.role}
            </span>
          </span>
          <form action="/api/auth/signout" method="post">
            <button className="text-sm text-red-600 hover:text-red-800 font-medium">Sign Out</button>
          </form>
        </div>
      </header>

      {/* Side nav + content */}
      <div className="flex flex-1">
        <aside className="w-56 bg-white border-r border-gray-200 py-6">
          <nav className="space-y-1 px-3">
            <NavLink href="/dashboard" label="📊 Overview" />
            <NavLink href="/dashboard/complaints" label="📋 Complaints" />
            <NavLink href="/dashboard/analytics" label="📈 Analytics" />
          </nav>
        </aside>
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 font-medium transition-colors"
    >
      {label}
    </a>
  )
}
