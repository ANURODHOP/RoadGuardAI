import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  BackHandler,
} from 'react-native'
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import { supabase, getEvidenceUrl } from '../../src/lib/supabase'
import { Colors, Typography, Spacing, BorderRadius, Shadows, getStatusColor } from '../../src/lib/theme'
import type { Complaint, ComplaintEvidence } from '../../src/lib/supabase'

type StatusHistoryItem = {
  id: string
  old_status: string | null
  new_status: string
  note: string | null
  created_at: string
}

type ContributionItem = {
  id: string
  user_id: string
  contribution_type: string
  description: string | null
  created_at: string
  profiles: { display_name: string } | null
}

export default function ComplaintDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [evidence, setEvidence] = useState<ComplaintEvidence[]>([])
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>({})
  const [statusHistory, setStatusHistory] = useState<StatusHistoryItem[]>([])
  const [contributions, setContributions] = useState<ContributionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  // Android Back Handler: safely return to previous screen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (router.canGoBack()) {
          router.back()
        } else {
          router.replace('/(tabs)/reports')
        }
        return true
      }
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress)
      return () => subscription.remove()
    }, [router])
  )

  const loadComplaint = useCallback(async () => {
    if (!id) return
    setError('')

    const [complaintRes, evidenceRes, historyRes, contributionsRes] = await Promise.all([
      supabase.from('complaints').select('*').eq('id', id).single(),
      supabase.from('complaint_evidence').select('*').eq('complaint_id', id).order('created_at', { ascending: true }),
      supabase.from('complaint_status_history').select('*').eq('complaint_id', id).order('created_at', { ascending: true }),
      supabase.from('complaint_contributions').select('*, profiles(display_name)').eq('complaint_id', id).order('created_at', { ascending: false }),
    ])

    if (complaintRes.error) {
      setError(`Failed to load complaint: ${complaintRes.error.message}`)
    } else {
      setComplaint(complaintRes.data)
    }

    setEvidence(evidenceRes.data ?? [])
    setStatusHistory(historyRes.data ?? [])
    setContributions(contributionsRes.data ?? [])

    // Fetch signed URLs for evidence
    const urls: Record<string, string> = {}
    for (const ev of evidenceRes.data ?? []) {
      const url = await getEvidenceUrl(ev.storage_path)
      if (url) urls[ev.id] = url
    }
    setEvidenceUrls(urls)
  }, [id])

  useEffect(() => {
    setLoading(true)
    loadComplaint().finally(() => setLoading(false))
  }, [loadComplaint])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadComplaint()
    setRefreshing(false)
  }, [loadComplaint])

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Loading complaint data...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (error || !complaint) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || 'Complaint not found'}</Text>
        </View>
      </SafeAreaView>
    )
  }

  const statusInfo = getStatusColor(complaint.complaint_status)
  const shortId = complaint.id.slice(0, 8).toUpperCase()

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          id="btn-back-complaint-detail"
          onPress={() => {
            if (router.canGoBack()) router.back()
            else router.replace('/(tabs)/reports')
          }}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report #{shortId}</Text>
        <View style={[styles.statusChip, { backgroundColor: statusInfo.bg }]}>
          <Text style={[styles.statusChipText, { color: statusInfo.text }]}>{statusInfo.label}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Evidence photos */}
        {evidence.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Evidence Photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.evidenceScroll}>
              {evidence.map((ev) => (
                <View key={ev.id} style={styles.evidenceItem}>
                  {evidenceUrls[ev.id] ? (
                    <Image
                      source={{ uri: evidenceUrls[ev.id] }}
                      style={styles.evidenceImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.evidenceImage, styles.evidencePlaceholder]}>
                      <Text style={styles.evidencePlaceholderText}>🖼️</Text>
                      <Text style={styles.evidencePlaceholderSub}>Photo on file</Text>
                    </View>
                  )}
                  <View style={[styles.evidenceTypeBadge, { backgroundColor: Colors.surface }]}>
                    <Text style={styles.evidenceTypeText}>
                      {ev.evidence_type === 'repair_photo' ? 'After Repair' : 'Report Evidence'}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Details Card */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Complaint Details</Text>
          <View style={styles.detailCard}>
            <DetailRow label="Damage Type" value={complaint.damage_type?.replace('_', ' ')} />
            <DetailRow
              label="Submission Date"
              value={new Date(complaint.created_at).toLocaleDateString('en-IN', {
                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            />
            {complaint.address_label && <DetailRow label="Address" value={complaint.address_label} />}
            <DetailRow label="GPS Coordinates" value={`${complaint.latitude.toFixed(6)}, ${complaint.longitude.toFixed(6)}`} />
            {complaint.location_accuracy_m && (
              <DetailRow label="Location Accuracy" value={`±${complaint.location_accuracy_m.toFixed(0)} meters`} />
            )}
            {complaint.detection_confidence !== null && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>AI Detection</Text>
                <View style={styles.detailValueRow}>
                  <Text style={styles.detailValue}>{Math.round((complaint.detection_confidence ?? 0) * 100)}% confidence</Text>
                  <Text style={styles.detailNote}>(AI assessment verified by inspector)</Text>
                </View>
              </View>
            )}
            {complaint.description && <DetailRow label="User Description" value={complaint.description} />}
            {complaint.rejection_reason && (
              <DetailRow label="Rejection Reason" value={complaint.rejection_reason} isWarning />
            )}
            {complaint.resolution_note && (
              <DetailRow label="Resolution Note" value={complaint.resolution_note} isPositive />
            )}
            {complaint.resolved_at && (
              <DetailRow
                label="Resolved Date"
                value={new Date(complaint.resolved_at).toLocaleDateString('en-IN', {
                  year: 'numeric', month: 'long', day: 'numeric'
                })}
                isPositive
              />
            )}
          </View>
        </View>

        {/* Interactive Location Map */}
        {complaint.latitude && complaint.longitude ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hazard Location Map</Text>
            <View style={styles.mapCard}>
              <MapView
                style={styles.detailMap}
                provider={PROVIDER_DEFAULT}
                initialRegion={{
                  latitude: complaint.latitude,
                  longitude: complaint.longitude,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
                scrollEnabled={true}
                zoomEnabled={true}
              >
                <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />
                <Marker
                  coordinate={{ latitude: complaint.latitude, longitude: complaint.longitude }}
                  pinColor={statusInfo.text}
                  title={`Complaint #${shortId}`}
                  description={complaint.address_label ?? undefined}
                />
              </MapView>
              <View style={styles.mapAttribution}>
                <Text style={styles.mapAttributionText}>© OpenStreetMap contributors</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Status History Timeline */}
        {statusHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Official Status Timeline</Text>
            <View style={styles.timelineCard}>
              {statusHistory.map((item, index) => {
                const info = getStatusColor(item.new_status)
                return (
                  <View key={item.id} style={styles.timelineItem}>
                    <View style={styles.timelineDot}>
                      <View style={[styles.timelineDotInner, { backgroundColor: info.text }]} />
                      {index < statusHistory.length - 1 && <View style={styles.timelineLine} />}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={[styles.timelineStatus, { color: info.text }]}>{info.label}</Text>
                      {item.note && <Text style={styles.timelineNote}>{item.note}</Text>}
                      <Text style={styles.timelineDate}>
                        {new Date(item.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Community Confirmations */}
        {contributions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Community Confirmations ({contributions.length})</Text>
            {contributions.map((c) => (
              <View key={c.id} style={styles.contributionItem}>
                <Text style={styles.contributionType}>{c.contribution_type.replace('_', ' ')}</Text>
                {c.description && <Text style={styles.contributionDesc}>{c.description}</Text>}
                <Text style={styles.contributionDate}>
                  {new Date(c.created_at).toLocaleDateString('en-IN')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Duplicate link */}
        {complaint.duplicate_of && (
          <View style={styles.section}>
            <View style={styles.duplicateNotice}>
              <Text style={styles.duplicateNoticeTitle}>Linked to existing report</Text>
              <Text style={styles.duplicateNoticeDesc}>
                This report was linked as a duplicate of report #{complaint.duplicate_of.slice(0, 8).toUpperCase()}
              </Text>
              <TouchableOpacity
                id="btn-view-original"
                onPress={() => router.push(`/complaint/${complaint.duplicate_of}`)}
                style={styles.linkButton}
              >
                <Text style={styles.linkButtonText}>View Original Report →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function DetailRow({ label, value, isWarning, isPositive }: {
  label: string
  value: string
  isWarning?: boolean
  isPositive?: boolean
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[
        styles.detailValue,
        isWarning && { color: Colors.statusRejected },
        isPositive && { color: Colors.statusResolved },
      ]}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backButton: {
    paddingVertical: 4,
  },
  backButtonText: {
    fontSize: Typography.fontSize.md,
    color: Colors.accent,
    fontWeight: Typography.fontWeight.medium,
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusChipText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    textTransform: 'uppercase',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  evidenceScroll: {
    flexDirection: 'row',
  },
  evidenceItem: {
    marginRight: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  evidenceImage: {
    width: 220,
    height: 150,
  },
  evidencePlaceholder: {
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  evidencePlaceholderText: {
    fontSize: 32,
  },
  evidencePlaceholderSub: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  evidenceTypeBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  evidenceTypeText: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
  },
  detailCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textPrimary,
    flex: 2,
    textAlign: 'right',
  },
  detailValueRow: {
    flex: 2,
    alignItems: 'flex-end',
  },
  detailNote: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
  },
  mapCard: {
    height: 180,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
  },
  detailMap: {
    width: '100%',
    height: '100%',
  },
  mapAttribution: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  mapAttributionText: {
    fontSize: 9,
    color: Colors.textSecondary,
  },
  timelineCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  timelineDot: {
    alignItems: 'center',
    width: 16,
  },
  timelineDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: Spacing.md,
  },
  timelineStatus: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },
  timelineNote: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  timelineDate: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  contributionItem: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
    gap: 2,
  },
  contributionType: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  contributionDesc: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  contributionDate: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
  },
  duplicateNotice: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  duplicateNoticeTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
  },
  duplicateNoticeDesc: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  linkButton: {
    marginTop: 4,
  },
  linkButtonText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.accent,
    fontWeight: Typography.fontWeight.semibold,
  },
  errorContainer: {
    margin: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: '#FEF2F2',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
  },
  errorText: {
    fontSize: Typography.fontSize.md,
    color: Colors.statusRejected,
  },
})
