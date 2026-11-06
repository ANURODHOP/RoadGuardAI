'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import {
  MapPin,
  Search,
  Filter,
  Navigation,
  ExternalLink,
  ShieldAlert,
  Layers,
  Crosshair,
  Calendar,
  User,
  Activity,
  CheckCircle2,
  Clock,
  Compass,
} from 'lucide-react'

interface Incident {
  id: string
  latitude: number
  longitude: number
  accuracy: number | null
  address: string
  damageType: string
  confidence: number | null
  status: string
  createdAt: string
  reporter: string
}

interface MapClientViewProps {
  complaints: Incident[]
}

export function MapClientView({ complaints }: MapClientViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [damageFilter, setDamageFilter] = useState('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(
    complaints.length > 0 ? complaints[0].id : null
  )

  // Filter complaints
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false
      if (damageFilter !== 'ALL' && c.damageType !== damageFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesId = c.id.toLowerCase().includes(q)
        const matchesAddress = c.address.toLowerCase().includes(q)
        const matchesReporter = c.reporter.toLowerCase().includes(q)
        if (!matchesId && !matchesAddress && !matchesReporter) return false
      }
      return true
    })
  }, [complaints, statusFilter, damageFilter, searchQuery])

  // Current selected complaint
  const selected = useMemo(() => {
    if (!selectedId) return filteredComplaints[0] || null
    return complaints.find((c) => c.id === selectedId) || filteredComplaints[0] || null
  }, [complaints, filteredComplaints, selectedId])

  // Generate OpenStreetMap embed URL centered around selected item (or default city center)
  const mapCenter = useMemo(() => {
    if (selected) {
      return { lat: selected.latitude, lng: selected.longitude }
    }
    if (complaints.length > 0) {
      return { lat: complaints[0].latitude, lng: complaints[0].longitude }
    }
    // Default fallback (New Delhi municipal coordinates)
    return { lat: 28.6139, lng: 77.2090 }
  }, [selected, complaints])

  const delta = 0.008
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${mapCenter.lng - delta}%2C${mapCenter.lat - delta}%2C${mapCenter.lng + delta}%2C${mapCenter.lat + delta}&layer=mapnik&marker=${mapCenter.lat}%2C${mapCenter.lng}`

  return (
    <div className="space-y-4">
      {/* Control / Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by ID, road name, or reporter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="h-3.5 w-3.5" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="ALL">All Statuses</option>
                <option value="pending_verification">Pending Verification</option>
                <option value="verified">Verified</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="rejected">Rejected</option>
                <option value="duplicate">Duplicate</option>
              </select>
            </div>

            {/* Damage Filter */}
            <select
              value={damageFilter}
              onChange={(e) => setDamageFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="ALL">All Damage Types</option>
              <option value="pothole">Pothole</option>
              <option value="crack">Crack</option>
              <option value="subsidence">Subsidence</option>
              <option value="other">Other</option>
            </select>

            {(statusFilter !== 'ALL' || damageFilter !== 'ALL' || searchQuery) && (
              <button
                onClick={() => {
                  setStatusFilter('ALL')
                  setDamageFilter('ALL')
                  setSearchQuery('')
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 underline transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Map + Inspector Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[580px]">
        {/* Left: Map Viewport (8 cols) */}
        <div className="lg:col-span-8 flex flex-col rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {/* Map Subheader */}
          <div className="h-11 px-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-emerald-700" />
              <span className="font-semibold text-slate-800">Spatial Map Viewport</span>
              {selected && (
                <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {selected.latitude.toFixed(5)}°N, {selected.longitude.toFixed(5)}°E
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                OSM Vector Tile
              </span>
            </div>
          </div>

          {/* Map Frame / Canvas */}
          <div className="relative flex-1 min-h-[440px] bg-slate-100 flex items-center justify-center">
            {complaints.length === 0 ? (
              <div className="text-center p-8 max-w-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-200/70 mb-3 text-slate-500">
                  <MapPin className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-semibold text-slate-900">No Geocoded Incidents Registered</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Incidents submitted with verified GPS telemetry will appear interactively across municipal zones.
                </p>
              </div>
            ) : (
              <>
                <iframe
                  title="OpenStreetMap Viewport"
                  className="w-full h-full border-0 absolute inset-0"
                  src={osmEmbedUrl}
                  loading="lazy"
                />

                {/* Top overlay badge */}
                <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2 text-xs">
                  <Crosshair className="h-3.5 w-3.5 text-emerald-700" />
                  <span className="font-medium text-slate-800">
                    {filteredComplaints.length} marker{filteredComplaints.length === 1 ? '' : 's'} displayed
                  </span>
                </div>

                {/* Bottom attribution */}
                <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded text-[10px] text-slate-600 border border-slate-200 shadow-xs">
                  © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline hover:text-slate-900">OpenStreetMap</a> contributors
                </div>
              </>
            )}
          </div>

          {/* Quick Marker Selector Carousel / Strip */}
          {filteredComplaints.length > 0 && (
            <div className="p-3 border-t border-slate-200 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Incident Pins ({filteredComplaints.length})
                </span>
                <span className="text-[11px] text-slate-400">Select to inspect & center</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {filteredComplaints.map((c) => {
                  const isSelected = selected?.id === c.id
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={`flex-shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                          : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      <MapPin className={`h-3.5 w-3.5 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                      <div>
                        <div className="text-xs font-semibold leading-tight font-mono">
                          #{c.id.slice(0, 8)}
                        </div>
                        <div className={`text-[10px] capitalize ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                          {c.damageType}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Selected Case Dossier & Telemetry (4 cols) */}
        <div className="lg:col-span-4 flex flex-col rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="h-11 px-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800">Selected Incident Telemetry</span>
            {selected && <StatusBadge status={selected.status} />}
          </div>

          {selected ? (
            <div className="p-4 flex-1 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                {/* ID and Damage Type */}
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Incident Case ID
                  </span>
                  <div className="text-sm font-bold font-mono text-slate-900 mt-0.5 break-all">
                    {selected.id}
                  </div>
                </div>

                {/* Spatial Coordinates Card */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Navigation className="h-3.5 w-3.5 text-slate-400" />
                      Latitude
                    </span>
                    <span className="font-mono font-semibold text-slate-800">
                      {selected.latitude.toFixed(6)}°
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Navigation className="h-3.5 w-3.5 text-slate-400" />
                      Longitude
                    </span>
                    <span className="font-mono font-semibold text-slate-800">
                      {selected.longitude.toFixed(6)}°
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                    <span className="text-slate-500">GPS Accuracy</span>
                    <span className="font-medium text-slate-700">
                      {selected.accuracy ? `±${selected.accuracy.toFixed(1)} m` : 'Standard Cell Triangulation'}
                    </span>
                  </div>
                </div>

                {/* Metadata Items */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500 shrink-0">Address / Location:</span>
                    <span className="font-medium text-slate-800 text-right leading-tight">
                      {selected.address}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Damage Classification:</span>
                    <span className="font-semibold text-slate-900 capitalize">
                      {selected.damageType.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">AI Confidence:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {selected.confidence != null
                        ? `${Math.round(selected.confidence * 100)}%`
                        : 'Manual citizen report'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Reported By:</span>
                    <span className="font-medium text-slate-800 flex items-center gap-1">
                      <User className="h-3 w-3 text-slate-400" />
                      {selected.reporter}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Timestamp:</span>
                    <span className="text-slate-600 flex items-center gap-1 font-mono text-[11px]">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      {new Date(selected.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Link to Case Command Center */}
              <div className="pt-3 border-t border-slate-200">
                <Link
                  href={`/dashboard/complaints/${selected.id}`}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors"
                >
                  <span>Open Full Case Dossier</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center flex-1 flex flex-col items-center justify-center text-slate-400">
              <Layers className="h-8 w-8 mb-2 stroke-1" />
              <p className="text-xs">No incident selected</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
