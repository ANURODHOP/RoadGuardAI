import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'

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
    <div className="min-h-screen bg-slate-50 flex">
      {/* Professional Municipal Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          displayName={profile.display_name || ''}
          email={user.email || ''}
          role={profile.role}
        />
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
