import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

// ── Validation ──────────────────────────────────────────────────────────────
if (!supabaseUrl || supabaseUrl.includes('/rest/v1')) {
  console.error(
    '[Supabase] EXPO_PUBLIC_SUPABASE_URL is missing or incorrectly formatted. ' +
    'It should be https://<ref>.supabase.co (no /rest/v1 suffix).'
  )
}

// ── Secure token storage ────────────────────────────────────────────────────
// Uses expo-secure-store on native, localStorage on web
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key)
    }
    return SecureStore.getItemAsync(key)
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value)
      return Promise.resolve()
    }
    return SecureStore.setItemAsync(key, value)
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key)
      return Promise.resolve()
    }
    return SecureStore.deleteItemAsync(key)
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// ── Type helpers ────────────────────────────────────────────────────────────

export type Profile = {
  id: string
  display_name: string
  role: 'user' | 'admin' | 'moderator'
  avatar_url: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export type ComplaintStatus =
  | 'pending_verification'
  | 'verified'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'rejected'
  | 'duplicate'

export type DamageType = 'pothole' | 'crack' | 'subsidence' | 'other'

export type Complaint = {
  id: string
  reporter_id: string
  latitude: number
  longitude: number
  location_accuracy_m: number | null
  address_label: string | null
  damage_type: DamageType
  detection_confidence: number | null
  verification_status: string
  complaint_status: ComplaintStatus
  duplicate_of: string | null
  assigned_to: string | null
  description: string | null
  rejection_reason: string | null
  resolution_note: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export type ComplaintEvidence = {
  id: string
  complaint_id: string
  uploaded_by: string | null
  storage_path: string
  evidence_type: 'photo' | 'repair_photo' | 'street_view' | 'annotation'
  source: 'user' | 'admin' | 'system' | 'street_view'
  mime_type: string
  captured_at: string | null
  created_at: string
}

export type NearbyComplaint = {
  id: string
  latitude: number
  longitude: number
  damage_type: string
  complaint_status: string
  verification_status: string
  detection_confidence: number | null
  address_label: string | null
  created_at: string
  distance_meters: number
}

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_IMAGE_SIZE_BYTES = parseInt(
  process.env.EXPO_PUBLIC_MAX_IMAGE_SIZE_BYTES ?? '10485760', // 10 MB default
  10,
)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

// ── Signed URL cache ─────────────────────────────────────────────────────────
// Short-lived in-memory cache avoids creating a new signed URL on every render
const _signedUrlCache = new Map<string, { url: string; expiresAt: number }>()

export async function getEvidenceUrl(storagePath: string): Promise<string | null> {
  const cached = _signedUrlCache.get(storagePath)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    // Return cached URL if it expires more than 1 minute from now
    return cached.url
  }

  const ttlSeconds = 3600 // 1 hour
  const { data, error } = await supabase.storage
    .from('evidence')
    .createSignedUrl(storagePath, ttlSeconds)

  if (error) {
    console.warn('[Storage] getEvidenceUrl error:', error.message)
    return null
  }

  _signedUrlCache.set(storagePath, {
    url: data.signedUrl,
    expiresAt: Date.now() + ttlSeconds * 1000,
  })

  return data.signedUrl
}

// ── Image upload ─────────────────────────────────────────────────────────────

export type UploadResult = {
  storagePath: string
  fileSize: number
}

/**
 * Upload an image to Supabase storage.
 *
 * @param localUri - Local file URI from camera/gallery
 * @param complaintId - The complaint UUID (must be created before calling this)
 * @param evidenceType - Type of evidence
 * @param userId - Authenticated user ID (for unique path scoping)
 */
export async function uploadEvidence(
  localUri: string,
  complaintId: string,
  evidenceType: 'photo' | 'repair_photo' = 'photo',
  userId?: string,
): Promise<UploadResult | null> {
  try {
    const response = await fetch(localUri)
    const blob = await response.blob()

    // ── File size validation ───────────────────────────────────────────────
    if (blob.size > MAX_IMAGE_SIZE_BYTES) {
      const sizeMB = (blob.size / 1024 / 1024).toFixed(1)
      console.error(
        `[Storage] Image too large: ${sizeMB}MB (max ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB)`
      )
      return null
    }

    // ── File type validation ───────────────────────────────────────────────
    const mimeType = blob.type || 'image/jpeg'
    const normalizedMime = mimeType.toLowerCase().split(';')[0].trim()
    if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
      console.error(`[Storage] Unsupported file type: ${mimeType}`)
      return null
    }

    // ── Build unique storage path ──────────────────────────────────────────
    // Path: complaints/{complaint_id}/{user_id}/{evidenceType}_{timestamp}.jpg
    // This ensures no two users can overwrite each other's images.
    const userSegment = userId ?? 'unknown'
    const timestamp = Date.now()
    const extension = normalizedMime === 'image/png' ? 'png' : 'jpg'
    const fileName = `complaints/${complaintId}/${userSegment}/${evidenceType}_${timestamp}.${extension}`

    const { data, error } = await supabase.storage
      .from('evidence')
      .upload(fileName, blob, {
        contentType: normalizedMime,
        upsert: false, // Never overwrite — each upload is unique by timestamp
      })

    if (error) {
      console.error('[Storage] uploadEvidence error:', error.message)
      return null
    }

    return { storagePath: data.path, fileSize: blob.size }
  } catch (e: any) {
    console.error('[Storage] uploadEvidence exception:', e?.message ?? e)
    return null
  }
}

// ── Nearby complaints ────────────────────────────────────────────────────────

export async function fetchNearbyComplaints(
  lat: number,
  lon: number,
  radiusMeters: number = 30,
  excludeId?: string,
): Promise<NearbyComplaint[]> {
  const { data, error } = await supabase.rpc('nearby_complaints', {
    user_lat: lat,
    user_lon: lon,
    radius_meters: radiusMeters,
    exclude_id: excludeId ?? null,
  })

  if (error) {
    console.error('[DB] fetchNearbyComplaints error:', error.message)
    return []
  }

  return data ?? []
}

// ── Paginated user complaints ─────────────────────────────────────────────────

export type PaginatedComplaints = {
  complaints: Complaint[]
  totalCount: number
  hasMore: boolean
}

export async function fetchMyComplaintsPage(
  page: number = 1,
  pageSize: number = 20,
  statusFilter?: ComplaintStatus,
): Promise<PaginatedComplaints> {
  const { data, error } = await supabase.rpc('get_my_complaints_page', {
    p_page: page,
    p_page_size: pageSize,
    p_status: statusFilter ?? null,
  })

  if (error) {
    console.error('[DB] fetchMyComplaintsPage error:', error.message)
    return { complaints: [], totalCount: 0, hasMore: false }
  }

  const rows = (data ?? []) as (Complaint & { total_count: number })[]
  const totalCount = rows[0]?.total_count ?? 0
  const complaints = rows.map(({ total_count: _tc, ...c }) => c as Complaint)

  return {
    complaints,
    totalCount,
    hasMore: page * pageSize < totalCount,
  }
}
