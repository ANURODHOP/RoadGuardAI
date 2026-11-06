'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  UserCheck,
  Wrench,
  ShieldCheck,
  XCircle,
  Copy,
  AlertTriangle,
  MapPin,
  Calendar,
  User,
  FileText,
  Camera,
  ExternalLink,
  MessageSquare,
  Activity,
  Check,
  X,
  AlertCircle
} from 'lucide-react'
import { StatusBadge, ComplaintStatus } from '@/components/StatusBadge'

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending_verification: ['verified', 'rejected', 'duplicate'],
  verified: ['assigned', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['resolved'],
  resolved: [],
  rejected: [],
  duplicate: ['pending_verification'],
}

export default function ComplaintDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const [complaint, setComplaint] = useState<any>(null)
  const [evidence, setEvidence] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [contributions, setContributions] = useState<any[]>([])
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Modals & Action States
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showResolveModal, setShowResolveModal] = useState(false)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)

  const [actionNote, setActionNote] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [duplicateOf, setDuplicateOf] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')

  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const [c, ev, h, contrib] = await Promise.all([
      supabase.from('complaints').select('*').eq('id', id).single(),
      supabase
        .from('complaint_evidence')
        .select('*')
        .eq('complaint_id', id)
        .order('created_at'),
      supabase
        .from('complaint_status_history')
        .select('*')
        .eq('complaint_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('complaint_contributions')
        .select('*, profiles(display_name)')
        .eq('complaint_id', id)
        .order('created_at', { ascending: false }),
    ])

    setComplaint(c.data)
    setEvidence(ev.data ?? [])
    setHistory(h.data ?? [])
    setContributions(contrib.data ?? [])

    // Generate signed URLs
    const urls: Record<string, string> = {}
    for (const e of ev.data ?? []) {
      const { data } = await supabase.storage.from('evidence').createSignedUrl(e.storage_path, 3600)
      if (data) urls[e.id] = data.signedUrl
    }
    setEvidenceUrls(urls)
    setLoading(false)
  }, [id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const performAction = async (action: string, payload: Record<string, string> = {}) => {
    setActionLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          complaint_id: id,
          ...payload,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Action failed')
      }

      setSuccessMsg(data.message || `Action executed successfully.`)
      setShowRejectModal(false)
      setShowResolveModal(false)
      setShowDuplicateModal(false)
      setRejectionReason('')
      setResolutionNote('')
      setDuplicateOf('')
      setActionNote('')
      await loadData()
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating complaint')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        <p className="mt-2 text-xs font-medium text-slate-500">Loading complaint telemetry...</p>
      </div>
    )
  }

  if (!complaint) {
    return (
      <div className="py-16 text-center bg-white rounded-xl border border-slate-200 p-8">
        <AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-2" />
        <h2 className="text-base font-bold text-slate-900">Incident Not Found</h2>
        <p className="text-xs text-slate-500 mt-1">This complaint ID may have been deleted or does not exist.</p>
        <Link
          href="/dashboard/complaints"
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Complaints Registry</span>
        </Link>
      </div>
    )
  }

  const shortId = complaint.id.slice(0, 8).toUpperCase()
  const allowedTransitions = STATUS_TRANSITIONS[complaint.complaint_status] ?? []
  const primaryEvidence = evidence[0]
  const primaryImageUrl = primaryEvidence ? evidenceUrls[primaryEvidence.id] : null

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <Link
            href="/dashboard/complaints"
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 mb-2 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Complaints Registry</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-900">
              #{shortId}
            </h1>
            <StatusBadge status={complaint.complaint_status} size="lg" />
            {complaint.duplicate_of && (
              <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                Duplicate of #{complaint.duplicate_of.slice(0, 8).toUpperCase()}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Logged on {new Date(complaint.created_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}
          </p>
        </div>

        {/* Top Quick Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {allowedTransitions.includes('verified') && (
            <button
              onClick={() => performAction('verify')}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-xs disabled:opacity-60 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Verify Incident</span>
            </button>
          )}

          {allowedTransitions.includes('assigned') && (
            <button
              onClick={() => performAction('assign')}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs disabled:opacity-60 transition-colors"
            >
              <UserCheck className="h-4 w-4" />
              <span>Assign to Crew</span>
            </button>
          )}

          {allowedTransitions.includes('in_progress') && (
            <button
              onClick={() => performAction('update_status', { new_status: 'in_progress' })}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold shadow-xs disabled:opacity-60 transition-colors"
            >
              <Wrench className="h-4 w-4" />
              <span>Mark In Progress</span>
            </button>
          )}

          {allowedTransitions.includes('resolved') && (
            <button
              onClick={() => setShowResolveModal(true)}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-xs disabled:opacity-60 transition-colors"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Resolve Incident</span>
            </button>
          )}

          {allowedTransitions.includes('rejected') && (
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold shadow-2xs transition-colors"
            >
              <XCircle className="h-4 w-4" />
              <span>Reject Case</span>
            </button>
          )}

          {allowedTransitions.includes('duplicate') && (
            <button
              onClick={() => setShowDuplicateModal(true)}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs transition-colors"
            >
              <Copy className="h-4 w-4 text-slate-400" />
              <span>Mark Duplicate</span>
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 flex items-center justify-between text-xs text-emerald-800 font-medium shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-600 hover:text-emerald-800">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3.5 flex items-center justify-between text-xs text-rose-800 font-medium shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-rose-600 hover:text-rose-800">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 2-Column Incident Dossier */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Evidence Photo, Telemetry, Map Coordinates */}
        <div className="lg:col-span-2 space-y-6">
          {/* Photographic Evidence Card */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Primary Photographic Evidence
                </span>
              </div>
              {complaint.detection_confidence ? (
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>AI Confidence: {Math.round(complaint.detection_confidence * 100)}%</span>
                </div>
              ) : (
                <span className="text-[11px] font-medium text-slate-400">Manual Inspection Report</span>
              )}
            </div>

            <div className="p-5">
              {primaryImageUrl ? (
                <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-950 flex items-center justify-center max-h-[440px]">
                  <img
                    src={primaryImageUrl}
                    alt="Road damage evidence"
                    className="w-full h-full object-contain"
                  />
                  <a
                    href={primaryImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-black/70 hover:bg-black/90 text-white text-xs font-medium backdrop-blur-xs transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Full Resolution</span>
                  </a>
                </div>
              ) : (
                <div className="py-16 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <Camera className="h-8 w-8 text-slate-300 mx-auto mb-1" />
                  <p className="text-xs font-medium">No photograph attached with this report</p>
                </div>
              )}

              {/* Supporting Secondary Photos if community contributed */}
              {evidence.length > 1 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-700 mb-2">Supporting Community Evidence</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {evidence.slice(1).map((ev) => {
                      const url = evidenceUrls[ev.id]
                      return url ? (
                        <a
                          key={ev.id}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="aspect-square rounded-lg border border-slate-200 overflow-hidden bg-slate-100 block hover:opacity-90 transition-opacity"
                        >
                          <img src={url} alt="Secondary evidence" className="w-full h-full object-cover" />
                        </a>
                      ) : null
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Incident Telemetry & Geocoding Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <MapPin className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Geographic Telemetry & Metadata
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Reported Address Label
                </span>
                <p className="font-semibold text-slate-800 mt-0.5 text-sm">
                  {complaint.address_label || 'Unlabeled coordinates'}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Damage Classification
                </span>
                <p className="font-semibold text-slate-800 mt-0.5 text-sm capitalize">
                  {complaint.damage_type || 'Pothole'}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Exact GPS Coordinates
                </span>
                <p className="font-mono text-slate-700 mt-0.5">
                  {complaint.latitude?.toFixed(6)}, {complaint.longitude?.toFixed(6)}
                </p>
                {complaint.location_accuracy_m && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Hardware GPS Accuracy: ±{Math.round(complaint.location_accuracy_m)}m
                  </p>
                )}
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  External Map Navigation
                </span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${complaint.latitude},${complaint.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-semibold"
                >
                  <span>Open in Google Maps</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {complaint.description && (
              <div className="pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Citizen Description
                </span>
                <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200/60 leading-relaxed">
                  "{complaint.description}"
                </p>
              </div>
            )}

            {complaint.rejection_reason && (
              <div className="pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-rose-500 uppercase tracking-wider block mb-1">
                  Rejection Justification
                </span>
                <p className="text-xs text-rose-800 bg-rose-50 p-3 rounded-lg border border-rose-200 leading-relaxed font-medium">
                  {complaint.rejection_reason}
                </p>
              </div>
            )}

            {complaint.resolution_notes && (
              <div className="pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider block mb-1">
                  Resolution Log
                </span>
                <p className="text-xs text-emerald-800 bg-emerald-50 p-3 rounded-lg border border-emerald-200 leading-relaxed font-medium">
                  {complaint.resolution_notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 Col): Case Actions, History Timeline, Community */}
        <div className="space-y-6">
          {/* Action Note Box */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Quick Administrative Note
            </h2>
            <p className="text-[11px] text-slate-500">
              Attach an internal note with the next status action.
            </p>
            <textarea
              rows={2}
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              placeholder="e.g., Pothole confirmed at intersection, dispatching repair unit..."
              className="w-full p-2.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>

          {/* Chronological Status Audit Trail */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
              <Activity className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Status History Audit Trail
              </h2>
            </div>

            <div className="space-y-4">
              {history.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No status updates logged yet.</p>
              ) : (
                history.map((h, i) => (
                  <div key={h.id} className="relative pl-5 text-xs">
                    {/* Timeline line */}
                    {i < history.length - 1 && (
                      <div className="absolute left-1.5 top-2.5 bottom-0 w-0.5 bg-slate-200" />
                    )}
                    {/* Timeline dot */}
                    <div className="absolute left-0 top-1 h-3 w-3 rounded-full border-2 border-white bg-slate-700 shadow-xs" />

                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusBadge status={h.new_status} size="sm" showIcon={false} />
                        {h.old_status && (
                          <span className="text-[10px] text-slate-400">
                            from {h.old_status}
                          </span>
                        )}
                      </div>
                      {h.note && (
                        <p className="mt-1 text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                          {h.note}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">
                        {new Date(h.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Community Confirmations */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Citizen Confirmations ({contributions.length})
              </h2>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                Community
              </span>
            </div>

            {contributions.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">
                No secondary citizen confirmations logged yet.
              </p>
            ) : (
              <div className="space-y-3">
                {contributions.map((cnt) => (
                  <div key={cnt.id} className="text-xs p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        {cnt.profiles?.display_name || 'Community Resident'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(cnt.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {cnt.description && (
                      <p className="text-[11px] text-slate-600 mt-1">"{cnt.description}"</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MODALS ── */}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-rose-700 mb-3">
              <XCircle className="h-5 w-5" />
              <h3 className="text-sm font-bold">Reject Complaint Case</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              A clear justification is mandatory. This reason will be recorded in the audit history and visible to reporting citizens.
            </p>
            <textarea
              rows={3}
              required
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Provide reason: e.g., Private property driveway, insufficient damage, outside municipal jurisdiction..."
              className="w-full p-3 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-rose-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => performAction('reject', { rejection_reason: rejectionReason, note: actionNote })}
                disabled={!rejectionReason.trim() || actionLoading}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-xs font-semibold text-white shadow-xs"
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-emerald-700 mb-3">
              <ShieldCheck className="h-5 w-5" />
              <h3 className="text-sm font-bold">Mark Incident as Resolved</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Enter municipal repair details or work order resolution notes for the case dossier.
            </p>
            <textarea
              rows={3}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="e.g., Asphalt patching completed by Crew #4. Surface leveled and inspected."
              className="w-full p-3 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowResolveModal(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => performAction('resolve', { resolution_note: resolutionNote, note: actionNote })}
                disabled={actionLoading}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-xs font-semibold text-white shadow-xs"
              >
                {actionLoading ? 'Resolving...' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-slate-800 mb-3">
              <Copy className="h-5 w-5 text-slate-500" />
              <h3 className="text-sm font-bold">Merge as Duplicate Report</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Enter the primary complaint UUID to link this report to. The evidence and reporting history will be preserved under the primary case.
            </p>
            <input
              type="text"
              required
              value={duplicateOf}
              onChange={(e) => setDuplicateOf(e.target.value)}
              placeholder="Enter Primary Case UUID (e.g. 624c1ebf-...)"
              className="w-full p-2.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-700 mb-4 font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDuplicateModal(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => performAction('mark_duplicate', { duplicate_of: duplicateOf, note: actionNote })}
                disabled={!duplicateOf.trim() || actionLoading}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-xs font-semibold text-white shadow-xs"
              >
                {actionLoading ? 'Merging...' : 'Confirm Duplicate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
