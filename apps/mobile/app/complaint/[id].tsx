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
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
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
          <Text style={styles.loadingText}>Loading complaint...</Text>
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
          onPress={() => router.back()}
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
            <Text style={styles.sectionTitle}>Photos</Text>
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
                    </View>
                  )}
                  <View style={[styles.evidenceTypeBadge, { backgroundColor: Colors.surface }]}>
                    <Text style={styles.evidenceTypeText}>
                      {ev.evidence_type === 'repair_photo' ? 'After Repair' : 'Report Photo'}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailCard}>
            <DetailRow label="Damage Type" value={complaint.damage_type?.replace('_', ' ')} />
            <DetailRow label="Reported" value={new Date(complaint.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })} />
            {complaint.address_label && <DetailRow label="Location" value={complaint.address_label} />}
            <DetailRow label="Coordinates" value={`${complaint.latitude.toFixed(5)}, ${complaint.longitude.toFixed(5)}`} />
            {complaint.location_accuracy_m && (
              <DetailRow label="GPS Accuracy" value={`±${complaint.location_accuracy_m.toFixed(0)} m`} />
            )}
            {complaint.detection_confidence !== null && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>AI Detection</Text>
                <View style={styles.detailValueRow}>
                  <Text style={styles.detailValue}>{Math.round((complaint.detection_confidence ?? 0) * 100)}% confidence</Text>
                  <Text style={styles.detailNote}>(AI result — administrator verifies)</Text>
                </View>
              </View>
            )}
            {complaint.description && <DetailRow label="Description" value={complaint.description} />}
            {complaint.rejection_reason && (
              <DetailRow label="Rejection Reason" value={complaint.rejection_reason} isWarning />
            )}
            {complaint.resolution_note && (
              <DetailRow label="Resolution" value={complaint.resolution_note} isPositive />
            )}
          </View>
        </View>

        {/* Community Contributions */}
        {contributions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Community Confirmations</Text>
            {contributions.map((c) => (
              <View key={c.id} style={styles.contributionItem}>
                <Text style={styles.contributionType}>{c.contribution_type.replace('_', ' ')}</Text>
                {c.description && <Text style={styles.contributionDesc}>{c.description}</Text>}
                <Text style={styles.contributionDate}>
                  {new Date(c.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Status Timeline */}
        {statusHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Status History</Text>
            {statusHistory.map((item, index) => {
              const info = getStatusColor(item.new_status)
              return (
                <View key={item.id} style={styles.timelineItem}>
                  <View style={styles.timelineDot}>
                    <View style={[styles.timelineDotInner, { backgroundColor: info.text }]} />
                    {index < statusHistory.length - 1 && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineStatus}>{info.label}</Text>
                    {item.note && <Text style={styles.timelineNote}>{item.note}</Text>}
                    <Text style={styles.timelineDate}>
                      {new Date(item.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        )}

        {/* Duplicate link */}
        {complaint.duplicate_of && (
          <View style={styles.section}>
            <View style={styles.duplicateNotice}>
              <Text style={styles.duplicateNoticeTitle}>Linked to existing report</Text>
              <Text style={styles.duplicateNoticeDesc}>
                This report was linked to report #{complaint.duplicate_of.slice(0, 8).toUpperCase()}
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
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.xs,
  },
  backButton: {
    marginBottom: Spacing.xs,
  },
  backButtonText: {
    fontSize: Typography.fontSize.md,
    color: Colors.accent,
    fontWeight: Typography.fontWeight.medium,
  },
  headerTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
  },
  statusChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusChipText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },
  evidenceScroll: {
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  evidenceItem: {
    marginRight: Spacing.md,
    position: 'relative',
  },
  evidenceImage: {
    width: 200,
    height: 150,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
  },
  evidencePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  evidencePlaceholderText: {
    fontSize: 32,
  },
  evidenceTypeBadge: {
    position: 'absolute',
    bottom: Spacing.xs,
    left: Spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  evidenceTypeText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  detailCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  detailRow: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  detailLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    fontWeight: Typography.fontWeight.regular,
  },
  detailValueRow: {
    flexDirection: 'column',
  },
  detailNote: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
    fontStyle: 'italic',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  errorText: {
    fontSize: Typography.fontSize.md,
    color: Colors.statusRejected,
    textAlign: 'center',
  },
  contributionItem: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  contributionType: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.accent,
    textTransform: 'capitalize',
    marginBottom: 4,
  },
  contributionDesc: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  contributionDate: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  timelineDot: {
    alignItems: 'center',
    width: 20,
  },
  timelineDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: Colors.border,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: Spacing.sm,
  },
  timelineStatus: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
  },
  timelineNote: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  timelineDate: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  duplicateNotice: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.statusDuplicate,
  },
  duplicateNoticeTitle: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.statusDuplicate,
    marginBottom: 4,
  },
  duplicateNoticeDesc: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  linkButton: {
    paddingTop: Spacing.xs,
  },
  linkButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.accent,
    fontWeight: Typography.fontWeight.medium,
  },
})
