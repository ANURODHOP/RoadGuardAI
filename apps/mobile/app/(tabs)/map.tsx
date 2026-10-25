import React, { useEffect, useState, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native'
import MapView, { Marker, UrlTile, Callout, PROVIDER_DEFAULT } from 'react-native-maps'
import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { Colors, Typography, Spacing, BorderRadius, getStatusColor } from '../../src/lib/theme'
import type { Complaint } from '../../src/lib/supabase'

export default function MapScreen() {
  const router = useRouter()
  const mapRef = useRef<MapView>(null)
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadComplaints()
    getUserLocation()
  }, [])

  const loadComplaints = async () => {
    const { data, error } = await supabase
      .from('complaints')
      .select('id, latitude, longitude, damage_type, complaint_status, verification_status, address_label, created_at, detection_confidence')
      .not('complaint_status', 'eq', 'rejected')
      .order('created_at', { ascending: false })
      .limit(200)
    if (!error && data) setComplaints(data as any)
    setLoading(false)
  }

  const getUserLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') return
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
  }

  const centerOnUser = () => {
    if (!userLocation) {
      Alert.alert('Location unavailable', 'Could not get your location.')
      return
    }
    mapRef.current?.animateToRegion({
      ...userLocation, latitudeDelta: 0.01, longitudeDelta: 0.01,
    }, 600)
  }

  const getMarkerColor = (status: string) => {
    const info = getStatusColor(status)
    return info.text
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Reported Damage</Text>
        <Text style={styles.subtitle}>{complaints.length} report{complaints.length !== 1 ? 's' : ''} on map</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Loading map data...</Text>
        </View>
      ) : (
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={
              userLocation
                ? { ...userLocation, latitudeDelta: 0.05, longitudeDelta: 0.05 }
                : { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 10, longitudeDelta: 10 }
            }
            showsUserLocation
            showsMyLocationButton={false}
          >
            {/* OpenStreetMap tiles */}
            <UrlTile
              urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              maximumZ={19}
              flipY={false}
            />

            {/* Complaint markers */}
            {complaints.map((c) => (
              <Marker
                key={c.id}
                coordinate={{ latitude: c.latitude, longitude: c.longitude }}
                pinColor={getMarkerColor(c.complaint_status)}
              >
                <Callout onPress={() => router.push(`/complaint/${c.id}`)}>
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle}>
                      {c.damage_type?.replace('_', ' ') ?? 'Road Damage'}
                    </Text>
                    {c.address_label ? (
                      <Text style={styles.calloutSubtitle}>{c.address_label}</Text>
                    ) : null}
                    <View style={[styles.calloutStatus, { backgroundColor: getStatusColor(c.complaint_status).bg }]}>
                      <Text style={[styles.calloutStatusText, { color: getStatusColor(c.complaint_status).text }]}>
                        {getStatusColor(c.complaint_status).label}
                      </Text>
                    </View>
                    <Text style={styles.calloutTap}>Tap to view →</Text>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>

          {/* Center on user button */}
          <TouchableOpacity
            id="btn-center-on-location"
            style={styles.centerButton}
            onPress={centerOnUser}
          >
            <Text style={styles.centerButtonIcon}>📍</Text>
          </TouchableOpacity>

          {/* OSM Attribution */}
          <View style={styles.attribution}>
            <Text style={styles.attributionText}>© OpenStreetMap contributors</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md },
  loadingText: { fontSize: Typography.fontSize.md, color: Colors.textSecondary },
  mapContainer: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  centerButton: {
    position: 'absolute', bottom: 48, right: Spacing.lg,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.background,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  centerButtonIcon: { fontSize: 20 },
  attribution: {
    position: 'absolute', bottom: 8, left: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  attributionText: { fontSize: 10, color: Colors.textSecondary },
  callout: { padding: Spacing.sm, minWidth: 160, maxWidth: 220 },
  calloutTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary, textTransform: 'capitalize' },
  calloutSubtitle: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  calloutStatus: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginTop: Spacing.xs },
  calloutStatusText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold },
  calloutTap: { fontSize: Typography.fontSize.xs, color: Colors.accent, marginTop: Spacing.xs },
})
