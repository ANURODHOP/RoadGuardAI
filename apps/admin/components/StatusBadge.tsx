import React from 'react'
import {
  Clock,
  CheckCircle2,
  UserCheck,
  Wrench,
  ShieldCheck,
  XCircle,
  Copy,
  AlertCircle
} from 'lucide-react'

export type ComplaintStatus =
  | 'pending_verification'
  | 'verified'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'rejected'
  | 'duplicate'
  | string

interface StatusBadgeProps {
  status: ComplaintStatus
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

const STATUS_CONFIG: Record<
  string,
  {
    label: string
    bg: string
    text: string
    border: string
    dot: string
    icon: React.ComponentType<{ className?: string }>
  }
> = {
  pending_verification: {
    label: 'Pending Verification',
    bg: 'bg-amber-50/80',
    text: 'text-amber-700',
    border: 'border-amber-200/70',
    dot: 'bg-amber-500',
    icon: Clock,
  },
  verified: {
    label: 'Verified',
    bg: 'bg-sky-50/80',
    text: 'text-sky-700',
    border: 'border-sky-200/70',
    dot: 'bg-sky-500',
    icon: CheckCircle2,
  },
  assigned: {
    label: 'Assigned',
    bg: 'bg-indigo-50/80',
    text: 'text-indigo-700',
    border: 'border-indigo-200/70',
    dot: 'bg-indigo-500',
    icon: UserCheck,
  },
  in_progress: {
    label: 'In Progress',
    bg: 'bg-orange-50/80',
    text: 'text-orange-700',
    border: 'border-orange-200/70',
    dot: 'bg-orange-500',
    icon: Wrench,
  },
  resolved: {
    label: 'Resolved',
    bg: 'bg-emerald-50/80',
    text: 'text-emerald-700',
    border: 'border-emerald-200/70',
    dot: 'bg-emerald-500',
    icon: ShieldCheck,
  },
  rejected: {
    label: 'Rejected',
    bg: 'bg-rose-50/80',
    text: 'text-rose-700',
    border: 'border-rose-200/70',
    dot: 'bg-rose-500',
    icon: XCircle,
  },
  duplicate: {
    label: 'Duplicate',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
    icon: Copy,
  },
}

export function StatusBadge({ status, size = 'md', showIcon = true }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
    icon: AlertCircle,
  }

  const Icon = config.icon

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3 py-1.5 gap-2 font-medium',
  }[size]

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  }[size]

  return (
    <span
      className={`inline-flex items-center rounded-md border ${config.bg} ${config.text} ${config.border} ${sizeClasses} tracking-tight select-none`}
    >
      {showIcon && <Icon className={`${iconSizes} shrink-0 opacity-80`} />}
      <span>{config.label}</span>
    </span>
  )
}
