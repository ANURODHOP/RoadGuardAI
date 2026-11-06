import { createClient } from '@/lib/supabase-server'
import { MapClientView } from './MapClientView'
import { MapPin, AlertCircle, Layers } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function MapMonitoringPage() {
  const supabase = await createClient()

  // Fetch all geolocated complaints
  const { data: complaints, error } = await supabase
    .from('complaints')
    .select(`
      id,
      latitude,
      longitude,
      location_accuracy_m,
      address_label,
      damage_type,
      detection_confidence,
      verification_status,
      complaint_status,
      created_at,
      profiles!reporter_id (
        display_name
      )
    `)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('created_at', { ascending: false })
    .limit(250)

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">GIS Spatial Monitoring</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Real-time municipal road hazard spatial distribution and location verification
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600 mb-2" />
          <h3 className="text-sm font-semibold text-red-900">Failed to load spatial incident data</h3>
          <p className="text-xs text-red-600 mt-1">{error.message}</p>
        </div>
      </div>
    )
  }

  // Transform data cleanly
  const geocodedComplaints = (complaints || []).map((c: any) => ({
    id: c.id,
    latitude: Number(c.latitude),
    longitude: Number(c.longitude),
    accuracy: c.location_accuracy_m,
    address: c.address_label || `${Number(c.latitude).toFixed(4)}°, ${Number(c.longitude).toFixed(4)}°`,
    damageType: c.damage_type || 'pothole',
    confidence: c.detection_confidence,
    status: c.complaint_status,
    createdAt: c.created_at,
    reporter: c.profiles?.display_name || 'Anonymous Citizen',
  }))

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">GIS Spatial Monitoring</h2>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
              Live Feed
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-0.5">
            Geospatial visualization of citizen road reports, dispatch clusters, and verified field cases
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-xs text-xs">
            <MapPin className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold text-slate-800">{geocodedComplaints.length}</span>
            <span className="text-slate-500">geolocated incidents</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Map Component */}
      <MapClientView complaints={geocodedComplaints} />
    </div>
  )
}
