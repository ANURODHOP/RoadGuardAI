'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending_verification: ['verified', 'rejected', 'duplicate'],
  verified: ['assigned', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['resolved'],
  resolved: [],
  rejected: [],
  duplicate: ['pending_verification'],
}

const STATUS_COLORS: Record<string, string> = {
  pending_verification: 'bg-amber-100 text-amber-700 border-amber-200',
  verified: 'bg-blue-100 text-blue-700 border-blue-200',
  assigned: 'bg-purple-100 text-purple-700 border-purple-200',
  in_progress: 'bg-orange-100 text-orange-700 border-orange-200',
  resolved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  duplicate: 'bg-gray-100 text-gray-600 border-gray-200',
}

const statusLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

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
  const [actionNote, setActionNote] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [duplicateOf, setDuplicateOf] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => { loadData() }, [id])

  const loadData = async () => {
    const supabase = createClient()
    const [c, ev, h, contrib] = await Promise.all([
      supabase.from('complaints').select('*').eq('id', id).single(),
      supabase.from('complaint_evidence').select('*').eq('complaint_id', id).order('created_at'),
      supabase.from('complaint_status_history').select('*').eq('complaint_id', id).order('created_at'),
      supabase.from('complaint_contributions').select('*, profiles(display_name)').eq('complaint_id', id).order('created_at', { ascending: false }),
    ])
    setComplaint(c.data)
    setEvidence(ev.data ?? [])
    setHistory(h.data ?? [])
    setContributions(contrib.data ?? [])

    // Get signed URLs for evidence
    const urls: Record<string, string> = {}
    for (const e of (ev.data ?? [])) {
      const { data } = await supabase.storage.from('evidence').createSignedUrl(e.storage_path, 3600)
      if (data) urls[e.id] = data.signedUrl
    }
    setEvidenceUrls(urls)
    setLoading(false)
  }

  const performAction = async (action: string, extraData: Record<string, string> = {}) => {
    setActionLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setErrorMsg('Session expired. Please log in again.'); setActionLoading(false); return }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action,
        complaint_id: id,
        note: actionNote,
        rejection_reason: rejectionReason,
        resolution_note: resolutionNote,
        duplicate_of: duplicateOf,
        ...extraData,
      }),
    })

    const result = await response.json()
    if (!response.ok) {
      setErrorMsg(result.error ?? 'Action failed')
    } else {
      setSuccessMsg(`Action "${action}" applied successfully.`)
      await loadData()
    }
    setActionLoading(false)
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Loading complaint...</div>
  if (!complaint) return <div className="py-16 text-center text-gray-400">Complaint not found.</div>

  const allowedTransitions = STATUS_TRANSITIONS[complaint.complaint_status] ?? []
  const shortId = complaint.id.slice(0, 8).toUpperCase()

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => router.back()} className="text-sm text-green-700 hover:text-green-900 font-medium mb-2 flex items-center gap-1">
            ← Back to Complaints
          </button>
          <h2 className="text-2xl font-bold text-gray-900">Report #{shortId}</h2>
          <p className="text-gray-500 text-sm mt-1">
            Created {new Date(complaint.created_at).toLocaleString()}
          </p>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${STATUS_COLORS[complaint.complaint_status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
          {statusLabel(complaint.complaint_status)}
        </span>
      </div>

      {/* Success / Error messages */}
      {successMsg && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-800 text-sm">{successMsg}</div>}
      {errorMsg && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{errorMsg}</div>}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Details */}
        <div className="space-y-4">
          {/* Evidence photos */}
          {evidence.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Evidence Photos</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {evidence.map(ev => (
                  <div key={ev.id} className="flex-shrink-0">
                    {evidenceUrls[ev.id] ? (
                      <a href={evidenceUrls[ev.id]} target="_blank" rel="noopener noreferrer">
                        <img src={evidenceUrls[ev.id]} alt="Evidence" className="w-48 h-36 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity" />
                      </a>
                    ) : (
                      <div className="w-48 h-36 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                        <span className="text-gray-300 text-2xl">🖼️</span>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-1 capitalize">{ev.evidence_type.replace('_', ' ')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Complaint details */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Complaint Details</h3>
            <dl className="space-y-3 text-sm">
              <Detail label="Damage Type" value={complaint.damage_type?.replace('_', ' ')} capitalize />
              <Detail label="Verification" value={statusLabel(complaint.verification_status)} />
              <Detail label="Coordinates" value={`${Number(complaint.latitude).toFixed(5)}, ${Number(complaint.longitude).toFixed(5)}`} mono />
              {complaint.location_accuracy_m && <Detail label="GPS Accuracy" value={`±${Math.round(complaint.location_accuracy_m)}m`} />}
              {complaint.address_label && <Detail label="Address" value={complaint.address_label} />}
              {complaint.detection_confidence != null && (
                <Detail label="AI Detection" value={`${Math.round(complaint.detection_confidence * 100)}% (administrator verification required)`} />
              )}
              {complaint.description && <Detail label="User Description" value={complaint.description} />}
              {complaint.rejection_reason && <Detail label="Rejection Reason" value={complaint.rejection_reason} warn />}
              {complaint.resolution_note && <Detail label="Resolution Note" value={complaint.resolution_note} positive />}
              {complaint.duplicate_of && <Detail label="Duplicate Of" value={`#${complaint.duplicate_of.slice(0, 8).toUpperCase()}`} />}
            </dl>
          </div>

          {/* Community contributions */}
          {contributions.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Contributions ({contributions.length})</h3>
              <div className="space-y-2">
                {contributions.map(c => (
                  <div key={c.id} className="text-sm bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <span className="font-medium text-green-700 capitalize">{c.contribution_type.replace('_', ' ')}</span>
                    {c.description && <p className="text-gray-600 mt-1">{c.description}</p>}
                    <p className="text-gray-400 text-xs mt-1">{new Date(c.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Admin Actions + History */}
        <div className="space-y-4">
          {/* Admin actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Admin Actions</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Note (optional)</label>
                <textarea
                  value={actionNote}
                  onChange={e => setActionNote(e.target.value)}
                  placeholder="Add a note for this action..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                  rows={2}
                />
              </div>

              {/* Available transitions */}
              {allowedTransitions.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Change Status</label>
                  <div className="flex flex-wrap gap-2">
                    {allowedTransitions.map(t => (
                      <button
                        key={t}
                        onClick={() => performAction(
                          t === 'rejected' ? 'reject' : t === 'resolved' ? 'resolve' : t === 'duplicate' ? 'mark_duplicate' : 'update_status',
                          t === 'rejected' ? { rejection_reason: rejectionReason || 'Rejected by admin' }
                            : t === 'resolved' ? { resolution_note: resolutionNote || 'Issue resolved' }
                            : t === 'duplicate' ? { duplicate_of: duplicateOf }
                            : { new_status: t }
                        )}
                        disabled={actionLoading || (t === 'rejected' && !rejectionReason) || (t === 'resolved' && !resolutionNote)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 border ${STATUS_COLORS[t] ?? 'bg-gray-100 text-gray-600 border-gray-200'} hover:opacity-80`}
                      >
                        {actionLoading ? '...' : `→ ${statusLabel(t)}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Rejection reason */}
              {allowedTransitions.includes('rejected') && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Rejection Reason (required to reject)</label>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    placeholder="e.g. Image does not show road damage"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                </div>
              )}

              {/* Resolution note */}
              {allowedTransitions.includes('resolved') && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Resolution Note (required to resolve)</label>
                  <textarea
                    value={resolutionNote}
                    onChange={e => setResolutionNote(e.target.value)}
                    placeholder="Describe what repair was carried out..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                    rows={2}
                  />
                </div>
              )}

              {/* Duplicate ID */}
              {allowedTransitions.includes('duplicate') && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Original Complaint ID (to mark as duplicate)</label>
                  <input
                    type="text"
                    value={duplicateOf}
                    onChange={e => setDuplicateOf(e.target.value)}
                    placeholder="Full UUID of original complaint"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400 font-mono"
                  />
                </div>
              )}

              {/* Verify shortcut */}
              {complaint.complaint_status === 'pending_verification' && (
                <button
                  onClick={() => performAction('verify')}
                  disabled={actionLoading}
                  className="w-full py-2 bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {actionLoading ? 'Processing...' : '✓ Verify Complaint'}
                </button>
              )}
            </div>
          </div>

          {/* Status history */}
          {history.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Status History</h3>
              <div className="space-y-3">
                {history.map((h, i) => (
                  <div key={h.id} className="flex gap-3 text-sm">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-green-600 mt-1.5 flex-shrink-0" />
                      {i < history.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                    </div>
                    <div className="pb-3">
                      <span className="font-medium text-gray-800">{statusLabel(h.new_status)}</span>
                      {h.note && <p className="text-gray-500 text-xs mt-0.5">{h.note}</p>}
                      <p className="text-gray-400 text-xs mt-0.5">
                        {new Date(h.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value, capitalize, mono, warn, positive }: {
  label: string; value: string; capitalize?: boolean; mono?: boolean; warn?: boolean; positive?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="text-gray-400 w-32 flex-shrink-0">{label}</dt>
      <dd className={`text-gray-800 flex-1 ${capitalize ? 'capitalize' : ''} ${mono ? 'font-mono text-xs' : ''} ${warn ? 'text-red-600' : ''} ${positive ? 'text-green-700' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
