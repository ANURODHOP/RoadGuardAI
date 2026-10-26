import React, { useEffect, useState, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, Image, Dimensions,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { runInference } from '../src/lib/inference'
import { Colors, Typography, Spacing, BorderRadius, getDetectionStateColor } from '../src/lib/theme'
import type { InferenceResult, BoundingBox } from '../src/lib/inference'

const { width } = Dimensions.get('window')
const IMAGE_DISPLAY_WIDTH = width - Spacing.lg * 2
const IMAGE_DISPLAY_HEIGHT = IMAGE_DISPLAY_WIDTH * 0.75

export default function DetectionScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ imageUri: string; lat: string; lon: string; accuracy: string }>()
  const [result, setResult] = useState<InferenceResult | null>(null)
  const [inferring, setInferring] = useState(true)
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current || !params.imageUri) return
    hasRun.current = true
    runDetection()
  }, [params.imageUri])

  const runDetection = async () => {
    setInferring(true)
    const res = await runInference(params.imageUri)
    setResult(res)
    setInferring(false)
  }

  const stateColor = result ? getDetectionStateColor(result.state) : Colors.textSecondary

  const stateLabel = (state: string) => {
    switch (state) {
      case 'pothole_detected': return 'Damage Detected'
      case 'no_pothole_detected': return 'No Damage Detected'
      case 'uncertain_low_confidence': return 'Uncertain — Low Confidence'
      case 'model_not_found': return 'Model Not Found'
      case 'inference_error': return 'Analysis Failed'
      default: return 'Unknown'
    }
  }

  const stateDesc = (state: string) => {
    switch (state) {
      case 'pothole_detected': return 'The AI model flagged a potential road hazard in this image.'
      case 'no_pothole_detected': return 'No road damage patterns were detected. You can still submit a report for administrator review.'
      case 'uncertain_low_confidence': return 'The model found some patterns but confidence is too low to confirm. An administrator will assess the image.'
      case 'model_not_found': return 'The detection model could not be loaded. Your complaint will be submitted for manual review.'
      case 'inference_error': return `Analysis encountered an error: ${result?.errorMessage ?? 'Unknown error'}. You can still submit for manual review.`
      default: return ''
    }
  }

  const canContinue = true // Always allow submitting

  const handleContinue = () => {
    router.push({
      pathname: '/duplicate-check',
      params: {
        imageUri: params.imageUri,
        lat: params.lat,
        lon: params.lon,
        accuracy: params.accuracy,
        detectionState: result?.state ?? 'inference_error',
        detectionConfidence: result?.detections[0]?.confidence?.toString() ?? '0',
      },
    })
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          id="btn-retake-detection"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Retake</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analysis Results</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Section: AI Detection Result */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionLabelText}>AI DETECTION RESULT</Text>
          <Text style={styles.sectionLabelNote}>
            Model result only — location & admin verification required
          </Text>
        </View>

        {/* Image with bounding boxes */}
        <View style={styles.imageWrapper}>
          <Image
            source={{ uri: params.imageUri }}
            style={styles.image}
            resizeMode="cover"
          />
          {/* Bounding box overlays */}
          {result?.detections.map((box, i) => (
            <BoundingBoxOverlay key={i} box={box} displayW={IMAGE_DISPLAY_WIDTH} displayH={IMAGE_DISPLAY_HEIGHT} />
          ))}
          {inferring && (
            <View style={styles.inferringOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.inferringText}>Analyzing image...</Text>
            </View>
          )}
        </View>

        {/* Detection state */}
        {result && !inferring && (
          <View style={[styles.stateCard, { borderLeftColor: stateColor }]}>
            <View style={styles.stateHeader}>
              <View style={[styles.stateDot, { backgroundColor: stateColor }]} />
              <Text style={[styles.stateTitle, { color: stateColor }]}>
                {stateLabel(result.state)}
              </Text>
            </View>
            <Text style={styles.stateDesc}>{stateDesc(result.state)}</Text>

            {result.detections.length > 0 && (
              <View style={styles.confRow}>
                <Text style={styles.confLabel}>Confidence:</Text>
                <Text style={[styles.confValue, { color: stateColor }]}>
                  {Math.round((result.detections[0]?.confidence ?? 0) * 100)}%
                </Text>
                <Text style={styles.confTime}> · {Math.round(result.inferenceMs)}ms</Text>
              </View>
            )}

            {result.modelSource === 'coco_fallback' && (
              <View style={styles.modelNote}>
                <Text style={styles.modelNoteText}>
                  ℹ️ Using general-purpose AI model. Pothole-specific model provides better accuracy — see setup docs.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Section: Location Evidence */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionLabelText}>LOCATION EVIDENCE</Text>
        </View>
        <View style={styles.locationCard}>
          {params.lat && params.lon ? (
            <>
              <Text style={styles.locationCoords}>
                {parseFloat(params.lat).toFixed(5)}, {parseFloat(params.lon).toFixed(5)}
              </Text>
              {params.accuracy ? (
                <Text style={styles.locationAccuracy}>
                  GPS accuracy: ±{Math.round(parseFloat(params.accuracy))}m
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.locationUnavailable}>
              ⚠️ Location not captured — you can still submit for review
            </Text>
          )}
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            Detection results are one input. An administrator will independently verify every complaint before any status change.
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            id="btn-check-nearby"
            style={styles.primaryButton}
            onPress={handleContinue}
            disabled={inferring}
          >
            <Text style={styles.primaryButtonText}>
              {inferring ? 'Analyzing...' : 'Check Nearby Reports →'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            id="btn-retake-from-detection"
            style={styles.secondaryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryButtonText}>Retake Photo</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function BoundingBoxOverlay({ box, displayW, displayH }: { box: BoundingBox; displayW: number; displayH: number }) {
  const left = box.x1 * displayW
  const top = box.y1 * displayH
  const boxWidth = (box.x2 - box.x1) * displayW
  const boxHeight = (box.y2 - box.y1) * displayH
  const conf = Math.round(box.confidence * 100)

  return (
    <View
      style={[
        styles.bbox,
        { left, top, width: boxWidth, height: boxHeight,
          borderColor: conf >= 40 ? Colors.detected : Colors.uncertain },
      ]}
    >
      <View style={[styles.bboxLabel, { backgroundColor: conf >= 40 ? Colors.detected : Colors.uncertain }]}>
        <Text style={styles.bboxLabelText}>{box.className} {conf}%</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backButton: { paddingVertical: 4 },
  backText: { fontSize: Typography.fontSize.md, color: Colors.accent, fontWeight: Typography.fontWeight.medium },
  headerTitle: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary },
  sectionLabel: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.xs,
  },
  sectionLabelText: {
    fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary, letterSpacing: 0.8,
  },
  sectionLabelNote: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  imageWrapper: {
    marginHorizontal: Spacing.lg, borderRadius: BorderRadius.lg, overflow: 'hidden',
    width: IMAGE_DISPLAY_WIDTH, height: IMAGE_DISPLAY_HEIGHT, backgroundColor: Colors.surface,
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  inferringOverlay: {
    ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', gap: Spacing.md,
  },
  inferringText: { color: '#fff', fontSize: Typography.fontSize.md },
  bbox: {
    position: 'absolute', borderWidth: 2.5, borderRadius: 4,
  },
  bboxLabel: {
    position: 'absolute', top: -24, left: 0,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  bboxLabelText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  stateCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderLeftWidth: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  stateHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  stateDot: { width: 10, height: 10, borderRadius: 5 },
  stateTitle: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold },
  stateDesc: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  confRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  confLabel: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  confValue: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, marginLeft: 4 },
  confTime: { fontSize: Typography.fontSize.sm, color: Colors.textTertiary },
  modelNote: {
    marginTop: Spacing.sm, backgroundColor: Colors.accentLight,
    borderRadius: BorderRadius.sm, padding: Spacing.sm,
  },
  modelNoteText: { fontSize: Typography.fontSize.xs, color: Colors.accentDark, lineHeight: 18 },
  locationCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  locationCoords: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.medium, color: Colors.textPrimary, fontFamily: 'monospace' },
  locationAccuracy: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  locationUnavailable: { fontSize: Typography.fontSize.sm, color: Colors.statusPending },
  disclaimer: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.sm,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.borderLight,
  },
  disclaimerText: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, textAlign: 'center', lineHeight: 18, fontStyle: 'italic' },
  actions: { padding: Spacing.lg, gap: Spacing.sm },
  primaryButton: {
    backgroundColor: Colors.accent, borderRadius: BorderRadius.lg,
    paddingVertical: 15, alignItems: 'center',
  },
  primaryButtonText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: '#fff' },
  secondaryButton: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.lg,
    paddingVertical: 15, alignItems: 'center',
  },
  secondaryButtonText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.medium, color: Colors.textPrimary },
})
