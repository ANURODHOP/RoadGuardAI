import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, Image, Dimensions, BackHandler,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
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

  // Android Back Handler: return to camera capture
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
      case 'pothole_detected': return 'Road Damage Detected'
      case 'no_pothole_detected': return 'No Damage Detected by AI'
      case 'uncertain_low_confidence': return 'Uncertain — Low Confidence'
      case 'model_not_found': return 'AI Model Unavailable'
      case 'inference_error': return 'Analysis Incomplete'
      default: return 'Pending Review'
    }
  }

  const stateDesc = (state: string) => {
    switch (state) {
      case 'pothole_detected':
        return 'The AI model identified road damage patterns in this photo with high confidence.'
      case 'no_pothole_detected':
        return 'No damage patterns were detected by the model. You can still proceed to place the report on the map for manual inspection.'
      case 'uncertain_low_confidence':
        return 'The model observed potential irregularities, but confidence is below the threshold. A city inspector will verify your report.'
      case 'model_not_found':
        return 'Offline AI model could not be loaded. You can proceed with manual complaint reporting.'
      case 'inference_error':
        return `Model analysis encountered an issue: ${result?.errorMessage ?? 'Unknown error'}. You can retry or proceed with manual submission.`
      default:
        return 'Proceed to map verification.'
    }
  }

  const handleContinue = () => {
    router.push({
      pathname: '/location-select',
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
        <Text style={styles.headerTitle}>AI Road Inspection</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Section: AI Detection Result */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionLabelText}>EVIDENCE & DETECTION</Text>
          <Text style={styles.sectionLabelNote}>
            AI assessment preview — next step confirms location
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
              <Text style={styles.inferringText}>Running YOLO inspection...</Text>
            </View>
          )}
        </View>

        {/* Detection state card */}
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
                <Text style={styles.confTime}> · {Math.round(result.inferenceMs)}ms inference</Text>
              </View>
            )}

            {(result.state === 'inference_error' || result.state === 'model_not_found') && (
              <TouchableOpacity
                id="btn-retry-inference"
                style={styles.retryButton}
                onPress={runDetection}
              >
                <Text style={styles.retryButtonText}>🔄 Retry AI Analysis</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Section: Location Evidence */}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionLabelText}>LOCATION INFORMATION</Text>
        </View>

        <View style={styles.locationCard}>
          {params.lat && params.lon ? (
            <>
              <Text style={styles.locationCoords}>
                📍 {parseFloat(params.lat).toFixed(5)}, {parseFloat(params.lon).toFixed(5)}
              </Text>
              <Text style={styles.locationAccuracy}>
                GPS Accuracy: ±{Math.round(parseFloat(params.accuracy || '10'))}m
              </Text>
              <Text style={styles.locationNote}>
                You can fine-tune or move the pin on the map in the next step.
              </Text>
            </>
          ) : (
            <Text style={styles.locationUnavailable}>
              ⚠️ Location was not automatically captured. You will pinpoint the damage on the map next.
            </Text>
          )}
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            id="btn-continue-to-map"
            style={styles.primaryButton}
            onPress={handleContinue}
            disabled={inferring}
          >
            <Text style={styles.primaryButtonText}>Select / Confirm Location on Map →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            id="btn-retake-photo-secondary"
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
    ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center', alignItems: 'center', gap: Spacing.md,
  },
  inferringText: { color: '#fff', fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.medium },
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
  retryButton: {
    marginTop: Spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.accent,
    fontWeight: Typography.fontWeight.semibold,
  },
  locationCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  locationCoords: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.medium, color: Colors.textPrimary, fontFamily: 'monospace' },
  locationAccuracy: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  locationNote: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: 4 },
  locationUnavailable: { fontSize: Typography.fontSize.sm, color: Colors.statusPending },
  actions: { padding: Spacing.lg, gap: Spacing.sm, marginTop: Spacing.md },
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
