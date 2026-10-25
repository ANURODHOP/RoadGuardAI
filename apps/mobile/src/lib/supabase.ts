import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Secure token storage using expo-secure-store on native, localStorage on web
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

// Type helpers
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

// Helper: get signed URL for an evidence image
export async function getEvidenceUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('evidence')
    .createSignedUrl(storagePath, 3600) // 1 hour
  if (error) {
    console.warn('getEvidenceUrl error:', error.message)
    return null
  }
  return data.signedUrl
}

// Helper: upload evidence image
export async function uploadEvidence(
  localUri: string,
  complaintId: string,
  evidenceType: 'photo' | 'repair_photo' = 'photo',
): Promise<{ storagePath: string; publicUrl: string } | null> {
  try {
    const fileName = `${complaintId}/${evidenceType}_${Date.now()}.jpg`
    const response = await fetch(localUri)
    const blob = await response.blob()

    const { data, error } = await supabase.storage
      .from('evidence')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      })

    if (error) {
      console.error('uploadEvidence error:', error.message)
      return null
    }

    return { storagePath: data.path, publicUrl: '' }
  } catch (e) {
    console.error('uploadEvidence exception:', e)
    return null
  }
}

// Helper: fetch nearby complaints using the DB function
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
    console.error('fetchNearbyComplaints error:', error.message)
    return []
  }

  return data ?? []
}
