import React from 'react'

interface KpiCardProps {
  label: string
  value: number | string
  subtext?: string
  icon: React.ComponentType<{ className?: string }>
  badge?: {
    text: string
    variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  }
  highlight?: boolean
}

export function KpiCard({
  label,
  value,
  subtext,
  icon: Icon,
  badge,
  highlight = false,
}: KpiCardProps) {
  const badgeColors = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-sky-50 text-sky-700 border-sky-200',
  }[badge?.variant ?? 'neutral']

  return (
    <div
      className={`relative rounded-xl border bg-white p-5 transition-all shadow-sm ${
        highlight
          ? 'border-emerald-500/40 ring-1 ring-emerald-500/10'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-slate-900">
          {value}
        </span>
        {badge && (
          <span
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${badgeColors}`}
          >
            {badge.text}
          </span>
        )}
      </div>

      {subtext && (
        <p className="mt-1 text-xs text-slate-500 line-clamp-1">{subtext}</p>
      )}
    </div>
  )
}
