import React, { useState, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, TextInput, ActivityIndicator, Image, Alert, BackHandler,
} from 'react-native'
import * as Location from 'expo-location'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import { supabase, uploadEvidence } from '../src/lib/supabase'
import { Colors, Typography, Spacing, BorderRadius, getStatusColor, Shadows } from '../src/lib/theme'

type SubmitPhase = 'form' | 'submitting' | 'success' | 'error'
type SubmitStep = 'idle' | 'geocoding' | 'inserting' | 'uploading' | 'recording'

export default function SubmitComplaintScreen() {
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
    existingComplaintId?: string
    contributionOnly?: string
    adminReviewRequested?: string
  }>()

  const lat = parseFloat(params.lat || '0')
  const lon = parseFloat(params.lon || '0')
  const hasLocation = !isNaN(lat) && lat !== 0
  const isContributionOnly = params.contributionOnly === 'true'
  const existingId = params.existingComplaintId
  const isManuallySelected = params.isManual === 'true'

  const [description, setDescription] = useState('')
  const [damageType, setDamageType] = useState<'pothole' | 'crack' | 'subsidence' | 'other'>('pothole')
  const [phase, setPhase] = useState<SubmitPhase>('form')
  const [currentStep, setCurrentStep] = useState<SubmitStep>('idle')
  const [submittedId, setSubmittedId] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Double-submission lock
  const isSubmittingRef = useRef(false)

  // Android Back Handler: confirm before discarding report if user entered text
  const handleBack = useCallback(() => {
    if (description.trim().length > 0) {
      Alert.alert(
        'Discard Report?',
        'You have unsaved changes. Are you sure you want to go back?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() },
        ]
      )
    } else {
      router.back()
    }
  }, [description, router])

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleBack()
        return true
      }
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress)
      return () => subscription.remove()
    }, [handleBack])
  )

  const getStepLabel = (step: SubmitStep): string => {
    switch (step) {
      case 'geocoding': return 'Resolving location...'
      case 'inserting': return 'Creating database record...'
      case 'uploading': return 'Uploading evidence photo...'
      case 'recording': return 'Recording audit history...'
      default: return isContributionOnly ? 'Adding supporting contribution...' : 'Submitting complaint...'
    }
  }

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    setPhase('submitting')
    setCurrentStep('idle')

    try {
      // 1. Validate user session
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('You must be signed in to submit a complaint. Please log in.')
      }

      // 2. Validate coordinates
      if (!hasLocation) {
        throw new Error('Valid GPS coordinates or map location are required.')
      }

      let complaintId = existingId ?? ''

      if (!isContributionOnly) {
        // ── NEW COMPLAINT FLOW ──────────────────────────────────────────

        // Step 1: Use passed address or reverse geocode if empty
        setCurrentStep('geocoding')
        let finalAddress = params.addressLabel || null
        if (!finalAddress && hasLocation) {
          try {
            const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon })
            if (geo) {
              finalAddress = [geo.street, geo.district || geo.subregion, geo.city, geo.region].filter(Boolean).join(', ')
            }
          } catch {
            // graceful fallback
          }
        }

        // Step 2: Insert complaint into Supabase
        setCurrentStep('inserting')
        const conf = parseFloat(params.detectionConfidence || '0')
        const { data: complaint, error: insertError } = await supabase
          .from('complaints')
          .insert({
            reporter_id: user.id,
            latitude: lat,
            longitude: lon,
            location_accuracy_m: isManuallySelected ? null : (params.accuracy ? parseFloat(params.accuracy) : null),
            address_label: finalAddress,
            damage_type: damageType,
            detection_confidence: conf > 0 ? conf : null,
            verification_status: 'pending_verification',
            complaint_status: 'pending_verification',
            description: description.trim() || null,
          })
          .select('id')
          .single()

        if (insertError || !complaint) {
          throw new Error(`Failed to create report: ${insertError?.message ?? 'Unknown database error'}`)
        }
        complaintId = complaint.id

        // Step 3: Upload photo to Supabase storage
        setCurrentStep('uploading')
        if (params.imageUri) {
          const uploaded = await uploadEvidence(
            params.imageUri,
            complaintId,
            'photo',
            user.id,
          )

          if (uploaded) {
            // Step 4: Record evidence in complaint_evidence
            const { error: evidenceError } = await supabase.from('complaint_evidence').insert({
              complaint_id: complaintId,
              uploaded_by: user.id,
              storage_path: uploaded.storagePath,
              evidence_type: 'photo',
              source: 'user',
              mime_type: 'image/jpeg',
              file_size_bytes: uploaded.fileSize,
            })
            if (evidenceError) {
              console.warn('[Submit] Evidence insert note:', evidenceError.message)
            }
          }
        }

        // Step 5: Record original contribution
        setCurrentStep('recording')
        try {
          await supabase.from('complaint_contributions').insert({
            complaint_id: complaintId,
            user_id: user.id,
            contribution_type: 'original_report',
            description: description.trim() || null,
          })
        } catch {
          // Non-critical: contribution record failed but complaint succeeded
        }

      } else {
        // ── CONTRIBUTION FLOW (Confirming Existing Complaint) ─────────────
        if (!complaintId) throw new Error('Existing complaint ID is missing for contribution.')

        setCurrentStep('uploading')
        if (params.imageUri) {
          const uploaded = await uploadEvidence(
            params.imageUri,
            complaintId,
            'photo',
            user.id,
          )

          if (uploaded) {
            await supabase.from('complaint_evidence').insert({
              complaint_id: complaintId,
              uploaded_by: user.id,
              storage_path: uploaded.storagePath,
              evidence_type: 'photo',
              source: 'user',
              mime_type: 'image/jpeg',
              file_size_bytes: uploaded.fileSize,
            })
          }
        }

        // Record confirmation
        setCurrentStep('recording')
        const { error: confirmError } = await supabase.from('complaint_contributions').insert({
          complaint_id: complaintId,
          user_id: user.id,
          contribution_type: 'confirmation',
          description: description.trim() || 'Citizen confirmed damage is still present',
        })

        if (confirmError) {
          if (confirmError.code === '23505') {
            throw new Error('You have already confirmed this existing complaint.')
          }
          throw new Error(`Confirmation failed: ${confirmError.message}`)
        }
      }

      setSubmittedId(complaintId)
      setPhase('success')
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Submission encountered an error. Please try again.')
      setPhase('error')
    } finally {
      isSubmittingRef.current = false
    }
  }

  // ── Submitting State ─────────────────────────────────────────────────────
  if (phase === 'submitting') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.submittingText}>{getStepLabel(currentStep)}</Text>
          <Text style={styles.submittingHint}>Please keep RoadGuard open while uploading</Text>
        </View>
      </SafeAreaView>
    )
  }

  // ── Success State ─────────────────────────────────────────────────────────
  if (phase === 'success') {
    const statusInfo = getStatusColor('pending_verification')
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>
            {isContributionOnly ? 'Evidence Confirmed' : 'Complaint Submitted'}
          </Text>
          <Text style={styles.successDesc}>
            {isContributionOnly
              ? 'Your confirmation and photo have been added to the report for administrator review.'
              : 'Your road hazard complaint has been registered in the municipal database.'}
          </Text>

          <View style={[styles.successCard, Shadows.md]}>
            <Text style={styles.successRefLabel}>Complaint Reference ID</Text>
            <Text style={styles.successRefId}>#{submittedId.slice(0, 8).toUpperCase()}</Text>
            <View style={[styles.statusPill, { backgroundColor: statusInfo.bg }]}>
              <Text style={[styles.statusPillText, { color: statusInfo.text }]}>{statusInfo.label}</Text>
            </View>
            <Text style={styles.successDate}>{new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}</Text>
          </View>

          <Text style={styles.successNote}>
            You can track inspection updates, work assignments, and repair resolution anytime in the My Reports tab.
          </Text>

          <TouchableOpacity
            id="btn-view-submitted-complaint"
            style={styles.primaryButton}
            onPress={() => router.replace(`/complaint/${submittedId}`)}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>View Complaint Details</Text>
          </TouchableOpacity>

          <TouchableOpacity
            id="btn-return-home-after-submit"
            style={styles.secondaryButton}
            onPress={() => router.replace('/(tabs)/')}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryButtonText}>Return to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── Error State ───────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Submission Failed</Text>
          <Text style={styles.errorDesc}>{errorMsg}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setPhase('form')}>
            <Text style={styles.primaryButtonText}>Review & Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── Form State ─────────────────────────────────────────────────────────────
  const DAMAGE_TYPES: Array<{ label: string; value: typeof damageType }> = [
    { label: 'Pothole', value: 'pothole' },
    { label: 'Road Crack', value: 'crack' },
    { label: 'Subsidence', value: 'subsidence' },
    { label: 'Other Hazard', value: 'other' },
  ]

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity id="btn-back-from-submit" onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isContributionOnly ? 'Confirm Existing Report' : 'Review & Submit Report'}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Photo thumbnail */}
        {params.imageUri && (
          <View style={styles.previewContainer}>
            <Image source={{ uri: params.imageUri }} style={styles.previewImage} resizeMode="cover" />
          </View>
        )}

        {/* Location & AI summary badges */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Location:</Text>
            <View style={[
              styles.accuracyPill,
              isManuallySelected ? styles.accuracyPillManual : styles.accuracyPillGps
            ]}>
              <Text style={[
                styles.accuracyPillText,
                isManuallySelected ? styles.accuracyPillTextManual : styles.accuracyPillTextGps
              ]}>
                {isManuallySelected ? '✋ Manually Selected' : `📍 GPS (±${Math.round(parseFloat(params.accuracy || '10'))}m)`}
              </Text>
            </View>
          </View>
          <Text style={styles.summaryCoords}>{lat.toFixed(6)}, {lon.toFixed(6)}</Text>
          {params.addressLabel ? (
            <Text style={styles.summaryAddress}>{params.addressLabel}</Text>
          ) : null}

          {params.detectionState && (
            <View style={styles.aiResultRow}>
              <Text style={styles.summaryLabel}>AI Assessment:</Text>
              <Text style={styles.aiResultValue}>
                {params.detectionState === 'pothole_detected'
                  ? `Pothole flagged (${Math.round(parseFloat(params.detectionConfidence || '0') * 100)}% conf)`
                  : params.detectionState === 'uncertain_low_confidence'
                  ? 'Uncertain (low confidence)'
                  : 'Manual review required'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.form}>
          {/* Damage Type Selection */}
          {!isContributionOnly && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Damage Category</Text>
              <View style={styles.typeGrid}>
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

          {/* Description Input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              Description <Text style={styles.fieldOptional}>(optional details for inspectors)</Text>
            </Text>
            <TextInput
              id="input-description"
              style={styles.textArea}
              placeholder={isContributionOnly
                ? 'Describe what you observed — e.g. pothole depth, water pooling...'
                : 'Provide details — e.g. near junction, in left lane, approx 2ft wide...'}
              placeholderTextColor={Colors.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Legal Notice */}
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              By submitting, you certify that this photo represents real road conditions at the indicated coordinates. False or spam submissions may result in account restrictions.
            </Text>
          </View>

          {/* Submit Action */}
          <TouchableOpacity
            id="btn-submit-report"
            style={styles.primaryButton}
            onPress={handleSubmit}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>
              {isContributionOnly ? 'Submit Supporting Evidence' : 'Submit Road Complaint'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: Spacing.xxl }} />
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
  scrollContent: { paddingBottom: Spacing.xl },
  previewContainer: {
    height: 200,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  previewImage: { width: '100%', height: '100%' },
  summaryCard: {
    margin: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  accuracyPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  accuracyPillGps: { backgroundColor: '#DCFCE7' },
  accuracyPillManual: { backgroundColor: '#FEF3C7' },
  accuracyPillText: { fontSize: 10, fontWeight: Typography.fontWeight.bold },
  accuracyPillTextGps: { color: '#166534' },
  accuracyPillTextManual: { color: '#B45309' },
  summaryCoords: {
    fontSize: Typography.fontSize.sm,
    fontFamily: 'monospace',
    color: Colors.textPrimary,
  },
  summaryAddress: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  aiResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  aiResultValue: {
    fontSize: Typography.fontSize.xs,
    color: Colors.accent,
    fontWeight: Typography.fontWeight.medium,
  },
  form: { paddingHorizontal: Spacing.lg, gap: Spacing.lg },
  fieldGroup: { gap: Spacing.xs },
  fieldLabel: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary },
  fieldOptional: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, fontWeight: Typography.fontWeight.regular },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeBtn: {
    flexBasis: '48%',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeBtnActive: { backgroundColor: Colors.accentLight, borderColor: Colors.accent },
  typeBtnText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, fontWeight: Typography.fontWeight.medium },
  typeBtnTextActive: { color: Colors.accent, fontWeight: Typography.fontWeight.semibold },
  textArea: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 90,
  },
  disclaimer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  disclaimerText: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, lineHeight: 18 },
  primaryButton: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  primaryButtonText: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.textInverse },
  secondaryButton: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.lg,
    paddingVertical: 14, alignItems: 'center', marginTop: Spacing.sm,
  },
  secondaryButtonText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.medium, color: Colors.textPrimary },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl, gap: Spacing.md },
  submittingText: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary },
  submittingHint: { fontSize: Typography.fontSize.sm, color: Colors.textTertiary },
  successContainer: { flex: 1, padding: Spacing.xl, justifyContent: 'center', alignItems: 'center' },
  successIcon: { fontSize: 56, marginBottom: Spacing.sm },
  successTitle: { fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  successDesc: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 4, marginBottom: Spacing.lg },
  successCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  successRefLabel: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 },
  successRefId: { fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, fontFamily: 'monospace' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full, marginTop: 4 },
  statusPillText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold },
  successDate: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: 4 },
  successNote: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, textAlign: 'center', lineHeight: 18, marginBottom: Spacing.lg },
  errorIcon: { fontSize: 56, marginBottom: Spacing.sm },
  errorTitle: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.statusRejected },
  errorDesc: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
})
