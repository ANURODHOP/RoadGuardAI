import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

interface ActionBody {
  action: 'verify' | 'reject' | 'assign' | 'update_status' | 'resolve' | 'mark_duplicate' | 'merge'
  complaint_id: string
  new_status?: string
  rejection_reason?: string
  assigned_to?: string
  resolution_note?: string
  duplicate_of?: string
  note?: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 })
    }

    // 2. Authorize admin / moderator role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || !['admin', 'moderator'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden: Administrator privileges required' },
        { status: 403 }
      )
    }

    const body: ActionBody = await request.json()
    const { action, complaint_id } = body

    if (!complaint_id) {
      return NextResponse.json({ error: 'complaint_id is required' }, { status: 400 })
    }

    // 3. Fetch current complaint state
    const { data: complaint, error: fetchErr } = await supabase
      .from('complaints')
      .select('id, complaint_status, verification_status')
      .eq('id', complaint_id)
      .single()

    if (fetchErr || !complaint) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 })
    }

    const oldStatus = complaint.complaint_status
    let newStatus = oldStatus
    const updateData: Record<string, unknown> = {}
    let historyNote = body.note?.trim() || ''

    switch (action) {
      case 'verify':
        newStatus = 'verified'
        updateData.complaint_status = 'verified'
        updateData.verification_status = 'verified'
        historyNote = historyNote || 'Verified by municipal administrator'
        break

      case 'reject':
        if (!body.rejection_reason?.trim()) {
          return NextResponse.json(
            { error: 'A specific rejection reason is mandatory for rejection' },
            { status: 400 }
          )
        }
        newStatus = 'rejected'
        updateData.complaint_status = 'rejected'
        updateData.verification_status = 'rejected'
        updateData.rejection_reason = body.rejection_reason.trim()
        historyNote = `Rejected: ${body.rejection_reason.trim()}`
        break

      case 'assign':
        newStatus = 'assigned'
        updateData.complaint_status = 'assigned'
        updateData.assigned_to = body.assigned_to || user.id
        updateData.assigned_at = new Date().toISOString()
        historyNote = historyNote || 'Assigned to field maintenance crew'
        break

      case 'update_status':
        if (!body.new_status) {
          return NextResponse.json({ error: 'new_status is required' }, { status: 400 })
        }
        newStatus = body.new_status
        updateData.complaint_status = body.new_status
        historyNote = historyNote || `Status changed to ${body.new_status}`
        break

      case 'resolve':
        newStatus = 'resolved'
        updateData.complaint_status = 'resolved'
        updateData.resolved_at = new Date().toISOString()
        if (body.resolution_note) {
          updateData.resolution_notes = body.resolution_note.trim()
        }
        historyNote = historyNote || `Resolved. Notes: ${body.resolution_note || 'Completed'}`
        break

      case 'mark_duplicate':
      case 'merge':
        if (!body.duplicate_of?.trim()) {
          return NextResponse.json(
            { error: 'Primary complaint ID (duplicate_of) is required' },
            { status: 400 }
          )
        }
        newStatus = 'duplicate'
        updateData.complaint_status = 'duplicate'
        updateData.duplicate_of = body.duplicate_of.trim()
        historyNote = `Marked as duplicate of #${body.duplicate_of.trim().slice(0, 8)}`
        break

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    // 4. Update complaint record
    const { error: updateError } = await supabase
      .from('complaints')
      .update(updateData)
      .eq('id', complaint_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // 5. Insert audit log record in status history
    const { error: historyError } = await supabase
      .from('complaint_status_history')
      .insert({
        complaint_id,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by: user.id,
        note: historyNote,
      })

    if (historyError) {
      console.warn('[Admin Action] Status history insert note:', historyError.message)
    }

    return NextResponse.json({
      success: true,
      complaint_id,
      old_status: oldStatus,
      new_status: newStatus,
      message: `Action "${action}" processed successfully.`,
    })
  } catch (err: any) {
    console.error('[Admin Action API Error]:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
