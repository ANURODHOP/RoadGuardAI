import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { fetchNearbyComplaints } from '../src/lib/supabase'
import { Colors, Typography, Spacing, BorderRadius, getStatusColor } from '../src/lib/theme'
import type { NearbyComplaint } from '../src/lib/supabase'

type Decision = 'likely_new' | 'potential_duplicate' | 'existing_unresolved'

function getDecision(nearby: NearbyComplaint[]): Decision {
  if (nearby.length === 0) return 'likely_new'
  const veryClose = nearby.filter(c => c.distance_meters <= 15)
  if (veryClose.some(c => ['verified', 'in_progress', 'assigned'].includes(c.complaint_status))) {
    return 'existing_unresolved'
  }
  if (veryClose.length > 0) return 'potential_duplicate'
  return 'likely_new'
}

export default function DuplicateCheckScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    imageUri: string; lat: string; lon: string; accuracy: string;
    detectionState: string; detectionConfidence: string;
  }>()

  const lat = parseFloat(params.lat || '0')
  const lon = parseFloat(params.lon || '0')
  const hasLocation = !isNaN(lat) && lat !== 0

  const [nearby, setNearby] = useState<NearbyComplaint[]>([])
  const [loading, setLoading] = useState(true)
  const [decision, setDecision] = useState<Decision>('likely_new')

  useEffect(() => {
    if (!hasLocation) { setLoading(false); return }
    fetchNearbyComplaints(lat, lon, 30).then(data => {
      setNearby(data)
      setDecision(getDecision(data))
      setLoading(false)
    })
  }, [])

  const navigateSubmit = (params_extra: Record<string, string>) => {
    router.push({
      pathname: '/submit-complaint',
      params: {
        imageUri: params.imageUri,
        lat: params.lat,
        lon: params.lon,
        accuracy: params.accuracy,
        detectionState: params.detectionState,
        detectionConfidence: params.detectionConfidence,
        ...params_extra,
      },
    })
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity id="btn-back-duplicate" onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nearby Reports</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>Checking nearby reports...</Text>
          </View>
        ) : (
          <>
            {/* Mini map */}
            {hasLocation && (
              <View style={styles.mapContainer}>
                <MapView
                  style={styles.map}
                  provider={PROVIDER_DEFAULT}
                  initialRegion={{ latitude: lat, longitude: lon, latitudeDelta: 0.003, longitudeDelta: 0.003 }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />
                  {/* User location */}
                  <Marker coordinate={{ latitude: lat, longitude: lon }} pinColor={Colors.accent}>
                  </Marker>
                  {/* Nearby markers */}
                  {nearby.map(c => (
                    <Marker
                      key={c.id}
                      coordinate={{ latitude: c.latitude, longitude: c.longitude }}
                      pinColor={getStatusColor(c.complaint_status).text}
                    />
                  ))}
                </MapView>
                <View style={styles.osmCredit}><Text style={styles.osmCreditText}>© OpenStreetMap contributors</Text></View>
              </View>
            )}

            {/* Decision card */}
            <View style={styles.decisionCard}>
              {decision === 'likely_new' && (
                <>
                  <Text style={styles.decisionIcon}>✅</Text>
                  <Text style={styles.decisionTitle}>No Nearby Reports Found</Text>
                  <Text style={styles.decisionDesc}>
                    {hasLocation
                      ? 'No existing reports within 30 metres of your location.'
                      : 'Location not captured — proceeding without proximity check.'}
                  </Text>
                </>
              )}
              {decision === 'potential_duplicate' && (
                <>
                  <Text style={styles.decisionIcon}>⚠️</Text>
                  <Text style={styles.decisionTitle}>Similar Report Nearby</Text>
                  <Text style={styles.decisionDesc}>
                    A report was found within 15 metres. It may describe the same pothole.
                    Review the report below before submitting.
                  </Text>
                </>
              )}
              {decision === 'existing_unresolved' && (
                <>
                  <Text style={styles.decisionIcon}>ℹ️</Text>
                  <Text style={styles.decisionTitle}>Known Issue Nearby</Text>
                  <Text style={styles.decisionDesc}>
                    A verified or in-progress repair report exists very close to your location.
                    You can confirm it still exists by adding supporting evidence.
                  </Text>
                </>
              )}
            </View>

            {/* Nearby list */}
            {nearby.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Nearby Complaints ({nearby.length})</Text>
                {nearby.map(c => {
                  const statusInfo = getStatusColor(c.complaint_status)
                  return (
                    <View key={c.id} style={styles.nearbyCard}>
                      <View style={styles.nearbyHeader}>
                        <Text style={styles.nearbyId}>#{c.id.slice(0, 8).toUpperCase()}</Text>
                        <View style={[styles.statusChip, { backgroundColor: statusInfo.bg }]}>
                          <Text style={[styles.statusChipText, { color: statusInfo.text }]}>{statusInfo.label}</Text>
                        </View>
                      </View>
                      <Text style={styles.nearbyDamage}>{c.damage_type?.replace('_', ' ')}</Text>
                      <Text style={styles.nearbyDistance}>📍 {Math.round(c.distance_meters)}m away</Text>
                      <Text style={styles.nearbyDate}>Reported {new Date(c.created_at).toLocaleDateString()}</Text>

                      {/* Confirm this report button */}
                      {(decision === 'existing_unresolved' || decision === 'potential_duplicate') && (
                        <TouchableOpacity
                          id={`btn-confirm-existing-${c.id}`}
                          style={styles.confirmButton}
                          onPress={() => navigateSubmit({ existingComplaintId: c.id, contributionOnly: 'true' })}
                        >
                          <Text style={styles.confirmButtonText}>Add Supporting Evidence to This Report</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )
                })}
              </View>
            )}

            {/* Action buttons */}
            <View style={styles.actions}>
              {decision === 'likely_new' && (
                <TouchableOpacity
                  id="btn-submit-new"
                  style={styles.primaryButton}
                  onPress={() => navigateSubmit({ contributionOnly: 'false' })}
                >
                  <Text style={styles.primaryButtonText}>Submit New Report →</Text>
                </TouchableOpacity>
              )}

              {(decision === 'potential_duplicate' || decision === 'existing_unresolved') && (
                <>
                  <TouchableOpacity
                    id="btn-submit-anyway"
                    style={styles.primaryButton}
                    onPress={() => navigateSubmit({ contributionOnly: 'false' })}
                  >
                    <Text style={styles.primaryButtonText}>Submit as New Report Anyway</Text>
                  </TouchableOpacity>
                  <Text style={styles.orText}>— or confirm an existing report above —</Text>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backText: { fontSize: Typography.fontSize.md, color: Colors.accent, fontWeight: Typography.fontWeight.medium },
  headerTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl, gap: Spacing.md },
  loadingText: { fontSize: Typography.fontSize.md, color: Colors.textSecondary },
  mapContainer: { height: 180, marginHorizontal: Spacing.lg, marginTop: Spacing.md, borderRadius: BorderRadius.lg, overflow: 'hidden', position: 'relative' },
  map: { flex: 1 },
  osmCredit: { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  osmCreditText: { fontSize: 9, color: Colors.textSecondary },
  decisionCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: Spacing.xs,
  },
  decisionIcon: { fontSize: 36 },
  decisionTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  decisionDesc: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  section: { padding: Spacing.lg, gap: Spacing.md },
  sectionTitle: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  nearbyCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, gap: 4,
  },
  nearbyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nearbyId: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, fontWeight: Typography.fontWeight.semibold, letterSpacing: 0.5 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  statusChipText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  nearbyDamage: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.medium, color: Colors.textPrimary, textTransform: 'capitalize' },
  nearbyDistance: { fontSize: Typography.fontSize.sm, color: Colors.accent },
  nearbyDate: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary },
  confirmButton: {
    marginTop: Spacing.sm, backgroundColor: Colors.accentLight,
    borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.accent,
  },
  confirmButtonText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.accent },
  actions: { padding: Spacing.lg, gap: Spacing.sm },
  primaryButton: { backgroundColor: Colors.accent, borderRadius: BorderRadius.lg, paddingVertical: 15, alignItems: 'center' },
  primaryButtonText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: '#fff' },
  orText: { textAlign: 'center', fontSize: Typography.fontSize.xs, color: Colors.textTertiary, paddingVertical: Spacing.xs },
})
