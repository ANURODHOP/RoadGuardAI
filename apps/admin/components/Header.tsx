'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Bell,
  LogOut,
  User,
  ShieldCheck,
  ChevronRight
} from 'lucide-react'

interface HeaderProps {
  displayName: string
  email: string
  role: string
  breadcrumbs?: Array<{ label: string; href?: string }>
}

export function Header({ displayName, email, role, breadcrumbs }: HeaderProps) {
  const router = useRouter()
  const [searchVal, setSearchVal] = React.useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchVal.trim()) return
    router.push(`/dashboard/complaints?q=${encodeURIComponent(searchVal.trim())}`)
  }

  return (
    <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Left: Breadcrumbs / Title */}
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-slate-700">RoadGuard</span>
        {breadcrumbs && breadcrumbs.length > 0 ? (
          breadcrumbs.map((crumb, i) => (
            <React.Fragment key={crumb.label}>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              {crumb.href ? (
                <a
                  href={crumb.href}
                  className="text-slate-500 hover:text-slate-800 transition-colors"
                >
                  {crumb.label}
                </a>
              ) : (
                <span className="font-semibold text-slate-900">{crumb.label}</span>
              )}
            </React.Fragment>
          ))
        ) : (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-semibold text-slate-900">Dashboard</span>
          </>
        )}
      </div>

      {/* Center: Quick Search Bar */}
      <form onSubmit={handleSearch} className="hidden md:flex items-center w-80 relative">
        <Search className="absolute left-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search complaint ID or address..."
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 transition-all"
        />
      </form>

      {/* Right: Notification, Profile, Signout */}
      <div className="flex items-center gap-4">
        {/* System Activity Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-[11px] font-medium text-slate-700">Audit Active</span>
        </div>

        {/* Profile Card & Logout */}
        <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-semibold select-none shadow-xs">
              {(displayName || email)[0].toUpperCase()}
            </div>
            <div className="hidden xl:block text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-900 leading-none">
                  {displayName || 'Administrator'}
                </span>
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200 uppercase">
                  {role}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-none">{email}</p>
            </div>
          </div>

          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
