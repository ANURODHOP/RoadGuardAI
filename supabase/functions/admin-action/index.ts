// RoadGuard — Supabase Edge Function: admin-action
// Performs privileged complaint status transitions.
// ONLY callable by users with role='admin' or 'moderator'.
// The service-role key never leaves this server-side function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AdminActionRequest {
  action: 'verify' | 'reject' | 'assign' | 'update_status' | 'resolve' | 'mark_duplicate' | 'merge'
  complaint_id: string
  new_status?: string
  rejection_reason?: string
  assigned_to?: string
  resolution_note?: string
  duplicate_of?: string
  note?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authenticate the requesting user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use service role client for privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Use user-scoped client to verify identity
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify admin role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || !['admin', 'moderator'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: AdminActionRequest = await req.json()
    const { action, complaint_id } = body

    if (!complaint_id) {
      return new Response(JSON.stringify({ error: 'complaint_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let updateData: Record<string, unknown> = {}
    let historyNote = body.note ?? ''

    switch (action) {
      case 'verify':
        updateData = {
          complaint_status: 'verified',
          verification_status: 'verified',
        }
        historyNote = historyNote || 'Verified by administrator'
        break

      case 'reject':
        if (!body.rejection_reason) {
          return new Response(JSON.stringify({ error: 'rejection_reason required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        updateData = {
          complaint_status: 'rejected',
          verification_status: 'rejected',
          rejection_reason: body.rejection_reason,
        }
        historyNote = `Rejected: ${body.rejection_reason}`
        break

      case 'assign':
        if (!body.assigned_to) {
          return new Response(JSON.stringify({ error: 'assigned_to required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        updateData = {
          complaint_status: 'assigned',
          assigned_to: body.assigned_to,
        }
        historyNote = historyNote || 'Assigned to team'
        break

      case 'update_status':
        if (!body.new_status) {
          return new Response(JSON.stringify({ error: 'new_status required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        updateData = { complaint_status: body.new_status }
        break

      case 'resolve':
        if (!body.resolution_note) {
          return new Response(JSON.stringify({ error: 'resolution_note required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        updateData = {
          complaint_status: 'resolved',
          resolution_note: body.resolution_note,
          resolved_at: new Date().toISOString(),
        }
        historyNote = `Resolved: ${body.resolution_note}`
        break

      case 'mark_duplicate':
        if (!body.duplicate_of) {
          return new Response(JSON.stringify({ error: 'duplicate_of required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        updateData = {
          complaint_status: 'duplicate',
          duplicate_of: body.duplicate_of,
        }
        historyNote = `Marked as duplicate of ${body.duplicate_of}`
        break

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    // Apply the update
    const { data: complaint, error: updateError } = await supabaseAdmin
      .from('complaints')
      .update(updateData)
      .eq('id', complaint_id)
      .select()
      .single()

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Record in status history
    await supabaseAdmin.from('complaint_status_history').insert({
      complaint_id,
      changed_by: user.id,
      old_status: complaint.complaint_status,
      new_status: updateData.complaint_status ?? complaint.complaint_status,
      note: historyNote,
    })

    return new Response(JSON.stringify({ success: true, complaint }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('admin-action error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
