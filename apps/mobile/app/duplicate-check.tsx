import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, Dimensions, BackHandler,
} from 'react-native'
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import { fetchNearbyComplaints } from '../src/lib/supabase'
import { Colors, Typography, Spacing, BorderRadius, getStatusColor, Shadows } from '../src/lib/theme'
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
    imageUri: string
    lat: string
    lon: string
    accuracy: string
    isManual?: string
    addressLabel?: string
    detectionState: string
    detectionConfidence: string
  }>()

  const lat = parseFloat(params.lat || '0')
  const lon = parseFloat(params.lon || '0')
  const hasLocation = !isNaN(lat) && lat !== 0

  const [nearby, setNearby] = useState<NearbyComplaint[]>([])
  const [loading, setLoading] = useState(true)
  const [decision, setDecision] = useState<Decision>('likely_new')

  // Android hardware back handler: return to location selection
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.back()
        return true
      }
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress)
      return () => subscription.remove()
    }, [router])
  )

  useEffect(() => {
    if (!hasLocation) {
      setLoading(false)
      return
    }
    fetchNearbyComplaints(lat, lon, 30).then(data => {
      setNearby(data)
      setDecision(getDecision(data))
      setLoading(false)
    }).catch(() => {
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
        isManual: params.isManual ?? 'false',
        addressLabel: params.addressLabel ?? '',
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
        <Text style={styles.headerTitle}>Proximity Duplicate Check</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>Checking for existing reports nearby...</Text>
          </View>
        ) : (
          <>
            {/* Interactive map preview */}
            {hasLocation && (
              <View style={styles.mapContainer}>
                <MapView
                  style={styles.map}
                  provider={PROVIDER_DEFAULT}
                  initialRegion={{
                    latitude: lat,
                    longitude: lon,
                    latitudeDelta: 0.003,
                    longitudeDelta: 0.003,
                  }}
                  showsUserLocation
                >
                  <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />
                  {/* Selected complaint marker */}
                  <Marker
                    coordinate={{ latitude: lat, longitude: lon }}
                    pinColor={Colors.accent}
                    title="Your Report Location"
                  />
                  {/* Nearby complaint markers */}
                  {nearby.map(c => (
                    <Marker
                      key={c.id}
                      coordinate={{ latitude: c.latitude, longitude: c.longitude }}
                      pinColor={getStatusColor(c.complaint_status).text}
                      title={`Report #${c.id.slice(0, 8).toUpperCase()}`}
                      description={`${Math.round(c.distance_meters)}m away · ${c.damage_type}`}
                    />
                  ))}
                </MapView>
                <View style={styles.osmCredit}>
                  <Text style={styles.osmCreditText}>© OpenStreetMap contributors</Text>
                </View>
              </View>
            )}

            {/* Decision card */}
            <View style={styles.decisionCard}>
              {decision === 'likely_new' && (
                <>
                  <Text style={styles.decisionIcon}>✅</Text>
                  <Text style={styles.decisionTitle}>No Existing Reports Nearby</Text>
                  <Text style={styles.decisionDesc}>
                    {hasLocation
                      ? 'No active damage reports were found within 30 metres of your selected location. This appears to be a new report.'
                      : 'Location not pinpointed — proceeding without proximity check.'}
                  </Text>
                </>
              )}
              {decision === 'potential_duplicate' && (
                <>
                  <Text style={styles.decisionIcon}>⚠️</Text>
                  <Text style={styles.decisionTitle}>Potential Duplicate Found</Text>
                  <Text style={styles.decisionDesc}>
                    Another user reported road damage within 15 metres. You can confirm and add supporting evidence to the existing report or submit as a separate hazard.
                  </Text>
                </>
              )}
              {decision === 'existing_unresolved' && (
                <>
                  <Text style={styles.decisionIcon}>ℹ️</Text>
                  <Text style={styles.decisionTitle}>Known Active Repair Nearby</Text>
                  <Text style={styles.decisionDesc}>
                    A verified or scheduled repair report already exists at this location. Confirming this report boosts community priority.
                  </Text>
                </>
              )}
            </View>

            {/* Nearby list */}
            {nearby.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Existing Reports Nearby ({nearby.length})</Text>
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
                      <Text style={styles.nearbyDistance}>📍 {Math.round(c.distance_meters)}m away from your pin</Text>
                      <Text style={styles.nearbyDate}>Reported {new Date(c.created_at).toLocaleDateString()}</Text>

                      {/* Confirm button */}
                      <TouchableOpacity
                        id={`btn-confirm-existing-${c.id}`}
                        style={styles.confirmButton}
                        onPress={() => navigateSubmit({ existingComplaintId: c.id, contributionOnly: 'true' })}
                      >
                        <Text style={styles.confirmButtonText}>
                          ✓ This is the Same Damage (Add Supporting Photo)
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </View>
            )}

            {/* Action buttons */}
            <View style={styles.actions}>
              {decision === 'likely_new' ? (
                <TouchableOpacity
                  id="btn-submit-new"
                  style={styles.primaryButton}
                  onPress={() => navigateSubmit({ contributionOnly: 'false' })}
                >
                  <Text style={styles.primaryButtonText}>Continue to Review & Submit →</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    id="btn-submit-anyway"
                    style={styles.primaryButton}
                    onPress={() => navigateSubmit({ contributionOnly: 'false' })}
                  >
                    <Text style={styles.primaryButtonText}>This is a Different Damage (New Report)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    id="btn-submit-unsure"
                    style={styles.secondaryButton}
                    onPress={() => navigateSubmit({ contributionOnly: 'false', adminReviewRequested: 'true' })}
                  >
                    <Text style={styles.secondaryButtonText}>I'm Not Sure (Submit for Admin Review)</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <View style={{ height: Spacing.xl }} />
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
    backgroundColor: Colors.background,
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
  confirmButtonText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.accent },
  actions: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginTop: Spacing.sm },
  primaryButton: { backgroundColor: Colors.accent, borderRadius: BorderRadius.lg, paddingVertical: 15, alignItems: 'center' },
  primaryButtonText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: '#fff' },
  secondaryButton: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.lg,
    paddingVertical: 14, alignItems: 'center',
  },
  secondaryButtonText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.textPrimary },
})
