'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard,
  ClipboardList,
  Clock,
  UserCheck,
  ShieldCheck,
  MapPin,
  BarChart3,
  Users,
  Settings,
  Shield,
  Layers,
  ChevronRight
} from 'lucide-react'

export function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentStatus = searchParams.get('status')

  const navGroups = [
    {
      group: 'Operations',
      items: [
        {
          label: 'Overview',
          href: '/dashboard',
          icon: LayoutDashboard,
          active: pathname === '/dashboard',
        },
        {
          label: 'All Complaints',
          href: '/dashboard/complaints',
          icon: ClipboardList,
          active: pathname === '/dashboard/complaints' && !currentStatus,
        },
        {
          label: 'Map Monitoring',
          href: '/dashboard/map',
          icon: MapPin,
          active: pathname === '/dashboard/map',
        },
      ],
    },
    {
      group: 'Workflow Queues',
      items: [
        {
          label: 'Verification Queue',
          href: '/dashboard/complaints?status=pending_verification',
          icon: Clock,
          active: pathname === '/dashboard/complaints' && currentStatus === 'pending_verification',
          badge: 'Review',
        },
        {
          label: 'Assigned Cases',
          href: '/dashboard/complaints?status=assigned',
          icon: UserCheck,
          active: pathname === '/dashboard/complaints' && currentStatus === 'assigned',
        },
        {
          label: 'Resolved Archive',
          href: '/dashboard/complaints?status=resolved',
          icon: ShieldCheck,
          active: pathname === '/dashboard/complaints' && currentStatus === 'resolved',
        },
      ],
    },
    {
      group: 'Administration',
      items: [
        {
          label: 'Analytics & Trends',
          href: '/dashboard/analytics',
          icon: BarChart3,
          active: pathname === '/dashboard/analytics',
        },
        {
          label: 'User Directory',
          href: '/dashboard/users',
          icon: Users,
          active: pathname === '/dashboard/users',
        },
        {
          label: 'System Settings',
          href: '/dashboard/settings',
          icon: Settings,
          active: pathname === '/dashboard/settings',
        },
      ],
    },
  ]

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col justify-between">
      <div>
        {/* Brand Header */}
        <div className="h-16 border-b border-slate-200 px-5 flex items-center gap-3 bg-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-white shadow-sm">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-900 tracking-tight text-base leading-none">
                RoadGuard
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
                ADMIN
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5 tracking-tight">
              Municipal Road Operations
            </p>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="p-3 space-y-6">
          {navGroups.map((group) => (
            <div key={group.group}>
              <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {group.group}
              </div>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                          item.active
                            ? 'bg-slate-100 text-slate-900 font-semibold shadow-xs'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon
                            className={`h-4 w-4 shrink-0 transition-colors ${
                              item.active ? 'text-emerald-700' : 'text-slate-400 group-hover:text-slate-600'
                            }`}
                          />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Operational footer badge */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/50">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium text-slate-700">System Live</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">v2.1.0</span>
        </div>
      </div>
    </aside>
  )
}
