import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, ActivityIndicator, Image, Alert,
} from 'react-native'
import * as Location from 'expo-location'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase, uploadEvidence } from '../src/lib/supabase'
import { Colors, Typography, Spacing, BorderRadius, getStatusColor } from '../src/lib/theme'

type SubmitPhase = 'form' | 'submitting' | 'success' | 'error'

export default function SubmitComplaintScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    imageUri: string; lat: string; lon: string; accuracy: string;
    detectionState: string; detectionConfidence: string;
    existingComplaintId?: string; contributionOnly?: string;
  }>()

  const lat = parseFloat(params.lat || '0')
  const lon = parseFloat(params.lon || '0')
  const hasLocation = !isNaN(lat) && lat !== 0
  const isContributionOnly = params.contributionOnly === 'true'
  const existingId = params.existingComplaintId

  const [description, setDescription] = useState('')
  const [damageType, setDamageType] = useState<'pothole' | 'crack' | 'subsidence' | 'other'>('pothole')
  const [phase, setPhase] = useState<SubmitPhase>('form')
  const [submittedId, setSubmittedId] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async () => {
    setPhase('submitting')
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Not authenticated')

      let complaintId = existingId ?? ''
      let storagePath = ''

      // 1. Upload image evidence
      if (params.imageUri) {
        const uploaded = await uploadEvidence(params.imageUri, complaintId || 'new', 'photo')
        if (uploaded) storagePath = uploaded.storagePath
      }

      if (!isContributionOnly) {
        // 2. Reverse geocode for address label
        let addressLabel: string | null = null
        if (hasLocation) {
          try {
            const [address] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon })
            if (address) {
              addressLabel = [address.street, address.district, address.city, address.region]
                .filter(Boolean).join(', ')
            }
          } catch { /* ignore */ }
        }

        // 3. Insert complaint
        const conf = parseFloat(params.detectionConfidence || '0')
        const { data: complaint, error: insertError } = await supabase
          .from('complaints')
          .insert({
            reporter_id: user.id,
            latitude: hasLocation ? lat : 0,
            longitude: hasLocation ? lon : 0,
            location_accuracy_m: params.accuracy ? parseFloat(params.accuracy) : null,
            address_label: addressLabel,
            damage_type: damageType,
            detection_confidence: conf > 0 ? conf : null,
            verification_status: 'pending_verification',
            complaint_status: 'pending_verification',
            description: description.trim() || null,
          })
          .select()
          .single()

        if (insertError) throw new Error(`Complaint insert failed: ${insertError.message}`)
        complaintId = complaint.id

        // 4. Re-upload evidence with correct complaint ID if it was uploaded to 'new'
        if (storagePath.startsWith('new/')) {
          // Move is not directly supported; the path is valid as-is for demo
        }

        // 5. Insert evidence record
        if (storagePath) {
          await supabase.from('complaint_evidence').insert({
            complaint_id: complaintId,
            uploaded_by: user.id,
            storage_path: storagePath,
            evidence_type: 'photo',
            source: 'user',
          })
        }

        // 6. Insert original_report contribution
        await supabase.from('complaint_contributions').insert({
          complaint_id: complaintId,
          user_id: user.id,
          contribution_type: 'original_report',
          description: description.trim() || null,
        })

        // 7. Record initial status history
        await supabase.from('complaint_status_history').insert({
          complaint_id: complaintId,
          changed_by: user.id,
          old_status: null,
          new_status: 'pending_verification',
          note: 'Complaint submitted by user',
        })

      } else {
        // Contributing evidence to existing complaint
        if (!complaintId) throw new Error('No existing complaint ID provided')

        if (storagePath) {
          await supabase.from('complaint_evidence').insert({
            complaint_id: complaintId,
            uploaded_by: user.id,
            storage_path: storagePath,
            evidence_type: 'photo',
            source: 'user',
          })
        }

        await supabase.from('complaint_contributions').insert({
          complaint_id: complaintId,
          user_id: user.id,
          contribution_type: 'confirmation',
          description: description.trim() || 'User confirmed damage still present',
        })
      }

      setSubmittedId(complaintId)
      setPhase('success')
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Submission failed. Please try again.')
      setPhase('error')
    }
  }

  if (phase === 'submitting') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.submittingText}>
            {isContributionOnly ? 'Adding your confirmation...' : 'Submitting your report...'}
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  if (phase === 'success') {
    const statusInfo = getStatusColor('pending_verification')
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>
            {isContributionOnly ? 'Confirmation Added' : 'Report Submitted'}
          </Text>
          <Text style={styles.successDesc}>
            {isContributionOnly
              ? 'Your supporting evidence has been added to the existing report.'
              : 'Your complaint has been submitted and is pending administrator review.'}
          </Text>

          <View style={styles.successCard}>
            <Text style={styles.successRefLabel}>Reference ID</Text>
            <Text style={styles.successRefId}>#{submittedId.slice(0, 8).toUpperCase()}</Text>
            <View style={[styles.statusPill, { backgroundColor: statusInfo.bg }]}>
              <Text style={[styles.statusPillText, { color: statusInfo.text }]}>{statusInfo.label}</Text>
            </View>
            <Text style={styles.successDate}>{new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}</Text>
          </View>

          <Text style={styles.successNote}>
            You will be able to track your report status in My Reports. Administrators review complaints and update status as work progresses.
          </Text>

          <TouchableOpacity
            id="btn-view-reports"
            style={styles.primaryButton}
            onPress={() => router.replace('/(tabs)/reports')}
          >
            <Text style={styles.primaryButtonText}>View My Reports</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace('/(tabs)/')}
          >
            <Text style={styles.secondaryButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Submission Failed</Text>
          <Text style={styles.errorDesc}>{errorMsg}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setPhase('form')}>
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const DAMAGE_TYPES: Array<{ label: string; value: typeof damageType }> = [
    { label: 'Pothole', value: 'pothole' },
    { label: 'Crack', value: 'crack' },
    { label: 'Subsidence', value: 'subsidence' },
    { label: 'Other', value: 'other' },
  ]

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isContributionOnly ? 'Confirm Existing Report' : 'Submit Report'}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image preview */}
        {params.imageUri && (
          <Image source={{ uri: params.imageUri }} style={styles.previewImage} resizeMode="cover" />
        )}

        {/* Summary row */}
        <View style={styles.summaryRow}>
          {hasLocation && (
            <View style={styles.summaryItem}>
              <Text style={styles.summaryIcon}>📍</Text>
              <Text style={styles.summaryText}>
                {lat.toFixed(4)}, {lon.toFixed(4)}
              </Text>
            </View>
          )}
          {params.detectionState && (
            <View style={styles.summaryItem}>
              <Text style={styles.summaryIcon}>🤖</Text>
              <Text style={styles.summaryText}>
                {params.detectionState === 'pothole_detected' ? 'Damage flagged by AI'
                  : params.detectionState === 'uncertain_low_confidence' ? 'AI uncertain'
                  : 'AI: no damage found'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.form}>
          {/* Damage type */}
          {!isContributionOnly && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Damage Type</Text>
              <View style={styles.typeRow}>
                {DAMAGE_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    id={`type-${t.value}`}
                    style={[styles.typeBtn, damageType === t.value && styles.typeBtnActive]}
                    onPress={() => setDamageType(t.value)}
                  >
                    <Text style={[styles.typeBtnText, damageType === t.value && styles.typeBtnTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Description */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              Description <Text style={styles.fieldOptional}>(optional)</Text>
            </Text>
            <TextInput
              id="input-description"
              style={styles.textArea}
              placeholder={isContributionOnly
                ? 'Describe what you see — is damage still present?'
                : 'Describe the damage — size, depth, specific location...'}
              placeholderTextColor={Colors.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Disclaimer */}
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              {isContributionOnly
                ? 'Your confirmation will be added to the existing report and visible to administrators.'
                : 'Your report will be reviewed by an administrator. AI detection results are provided as supporting information only — verification is not automatic.'}
            </Text>
          </View>

          <TouchableOpacity
            id="btn-submit-report"
            style={styles.primaryButton}
            onPress={handleSubmit}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>
              {isContributionOnly ? 'Add Confirmation' : 'Submit Report'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: Spacing.xl }} />
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
  previewImage: { width: '100%', height: 200 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, backgroundColor: Colors.surface, paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border },
  summaryIcon: { fontSize: 14 },
  summaryText: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary },
  form: { padding: Spacing.lg, gap: Spacing.lg },
  fieldGroup: { gap: Spacing.xs },
  fieldLabel: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.textSecondary },
  fieldOptional: { fontWeight: Typography.fontWeight.regular, color: Colors.textTertiary },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  typeBtn: { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: BorderRadius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  typeBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  typeBtnText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, fontWeight: Typography.fontWeight.medium },
  typeBtnTextActive: { color: '#fff' },
  textArea: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    fontSize: Typography.fontSize.md, color: Colors.textPrimary, minHeight: 100,
  },
  disclaimer: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.borderLight },
  disclaimerText: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, lineHeight: 18, textAlign: 'center' },
  primaryButton: { backgroundColor: Colors.accent, borderRadius: BorderRadius.lg, paddingVertical: 15, alignItems: 'center' },
  primaryButtonText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: '#fff' },
  secondaryButton: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.lg, paddingVertical: 15, alignItems: 'center' },
  secondaryButtonText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.medium, color: Colors.textPrimary },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.lg },
  submittingText: { fontSize: Typography.fontSize.md, color: Colors.textSecondary },
  successContainer: { flex: 1, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md, justifyContent: 'center' },
  successIcon: { fontSize: 64 },
  successTitle: { fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  successDesc: { fontSize: Typography.fontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  successCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.xs, width: '100%' },
  successRefLabel: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  successRefId: { fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, fontFamily: 'monospace' },
  statusPill: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusPillText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  successDate: { fontSize: Typography.fontSize.sm, color: Colors.textTertiary },
  successNote: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  errorIcon: { fontSize: 48 },
  errorTitle: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  errorDesc: { fontSize: Typography.fontSize.md, color: Colors.statusRejected, textAlign: 'center', lineHeight: 22 },
})
