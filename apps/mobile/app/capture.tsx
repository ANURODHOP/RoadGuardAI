import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  Alert, ActivityIndicator, Image, Dimensions,
} from 'react-native'
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { useRouter } from 'expo-router'
import { Colors, Typography, Spacing, BorderRadius } from '../../src/lib/theme'

const { width } = Dimensions.get('window')
type Mode = 'camera' | 'gallery'
type GPSStatus = 'idle' | 'locating' | 'found' | 'unavailable'

export default function CaptureScreen() {
  const router = useRouter()
  const cameraRef = useRef<CameraView>(null)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [mode, setMode] = useState<Mode>('camera')
  const [facing, setFacing] = useState<CameraType>('back')
  const [capturedUri, setCapturedUri] = useState<string | null>(null)
  const [gpsStatus, setGpsStatus] = useState<GPSStatus>('idle')
  const [location, setLocation] = useState<{ lat: number; lon: number; accuracy: number | null } | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (!cameraPermission?.granted) requestCameraPermission()
    Location.requestForegroundPermissionsAsync()
  }, [])

  const captureGPS = async () => {
    setGpsStatus('locating')
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      setGpsStatus('unavailable')
      return
    }
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
      })
      setLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude, accuracy: loc.coords.accuracy })
      setGpsStatus('found')
    } catch {
      setGpsStatus('unavailable')
    }
  }

  const processImage = async (uri: string): Promise<string> => {
    // Resize to max 1024px, fix orientation, compress
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.85, format: SaveFormat.JPEG },
    )
    return result.uri
  }

  const takePicture = async () => {
    if (!cameraRef.current) return
    setProcessing(true)
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, exif: false })
      if (photo?.uri) {
        const processed = await processImage(photo.uri)
        setCapturedUri(processed)
        captureGPS()
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to take picture. Please try again.')
    }
    setProcessing(false)
  }

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo library access in Settings to select images.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
    })
    if (!result.canceled && result.assets[0]) {
      setProcessing(true)
      const processed = await processImage(result.assets[0].uri)
      setCapturedUri(processed)
      setProcessing(false)
      captureGPS()
    }
  }

  const handleContinue = () => {
    if (!capturedUri) return
    router.push({
      pathname: '/detection',
      params: {
        imageUri: capturedUri,
        lat: location?.lat?.toString() ?? '',
        lon: location?.lon?.toString() ?? '',
        accuracy: location?.accuracy?.toString() ?? '',
      },
    })
  }

  const gpsLabel = () => {
    switch (gpsStatus) {
      case 'locating': return '📡 Getting location...'
      case 'found': return `✅ GPS ±${Math.round(location?.accuracy ?? 0)}m`
      case 'unavailable': return '⚠️ Location unavailable — you can continue'
      default: return '📍 Location will be captured after photo'
    }
  }

  // ── Preview mode ────────────────────────────────────────────
  if (capturedUri) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedUri }} style={styles.previewImage} resizeMode="cover" />
          <View style={styles.previewOverlay}>
            {/* GPS status pill */}
            <View style={styles.gpsPill}>
              <Text style={styles.gpsPillText}>{gpsLabel()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.previewActions}>
          <TouchableOpacity
            id="btn-retake"
            style={styles.secondaryButton}
            onPress={() => { setCapturedUri(null); setGpsStatus('idle'); setLocation(null) }}
          >
            <Text style={styles.secondaryButtonText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            id="btn-use-photo"
            style={styles.primaryButton}
            onPress={handleContinue}
          >
            <Text style={styles.primaryButtonText}>Use This Photo →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── Camera mode ────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Mode toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          id="btn-camera-toggle"
          style={[styles.modeBtn, mode === 'camera' && styles.modeBtnActive]}
          onPress={() => setMode('camera')}
        >
          <Text style={[styles.modeBtnText, mode === 'camera' && styles.modeBtnTextActive]}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity
          id="btn-gallery"
          style={[styles.modeBtn, mode === 'gallery' && styles.modeBtnActive]}
          onPress={() => { setMode('gallery'); pickFromGallery() }}
        >
          <Text style={[styles.modeBtnText, mode === 'gallery' && styles.modeBtnTextActive]}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {mode === 'camera' && (
        <>
          {cameraPermission?.granted ? (
            <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
              {/* Guideline overlay */}
              <View style={styles.cameraGuide}>
                <View style={styles.guideFrame} />
                <Text style={styles.guideText}>Frame the road damage clearly</Text>
              </View>

              {/* Shutter controls */}
              <View style={styles.shutterRow}>
                <TouchableOpacity
                  style={styles.flipBtn}
                  onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
                >
                  <Text style={styles.flipBtnText}>🔄</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  id="btn-shutter"
                  style={styles.shutterBtn}
                  onPress={takePicture}
                  disabled={processing}
                >
                  {processing
                    ? <ActivityIndicator color="#fff" />
                    : <View style={styles.shutterInner} />
                  }
                </TouchableOpacity>
                <View style={{ width: 48 }} />
              </View>
            </CameraView>
          ) : (
            <View style={styles.permissionContainer}>
              <Text style={styles.permissionIcon}>📷</Text>
              <Text style={styles.permissionTitle}>Camera Access Required</Text>
              <Text style={styles.permissionDesc}>
                RoadGuard needs camera access to photograph road damage.
              </Text>
              <TouchableOpacity style={styles.primaryButton} onPress={requestCameraPermission}>
                <Text style={styles.primaryButtonText}>Allow Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkBtn} onPress={() => { setMode('gallery'); pickFromGallery() }}>
                <Text style={styles.linkBtnText}>Choose from gallery instead</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  modeToggle: {
    flexDirection: 'row', backgroundColor: '#000',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    alignItems: 'center', gap: Spacing.xs,
  },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: BorderRadius.full, alignItems: 'center', backgroundColor: '#1a1a1a' },
  modeBtnActive: { backgroundColor: Colors.accent },
  modeBtnText: { fontSize: Typography.fontSize.sm, color: '#888', fontWeight: Typography.fontWeight.medium },
  modeBtnTextActive: { color: '#fff' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  closeBtnText: { color: '#fff', fontSize: Typography.fontSize.md },
  camera: { flex: 1 },
  cameraGuide: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md },
  guideFrame: {
    width: width * 0.7, height: width * 0.7 * 0.75,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: BorderRadius.lg,
  },
  guideText: { color: 'rgba(255,255,255,0.8)', fontSize: Typography.fontSize.sm },
  shutterRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl,
  },
  shutterBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 3, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  flipBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  flipBtnText: { fontSize: 20 },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.md, backgroundColor: Colors.background },
  permissionIcon: { fontSize: 64 },
  permissionTitle: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  permissionDesc: { fontSize: Typography.fontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  primaryButton: { backgroundColor: Colors.accent, borderRadius: BorderRadius.lg, paddingVertical: 14, paddingHorizontal: Spacing.xl, alignItems: 'center', width: '100%' },
  primaryButtonText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: '#fff' },
  linkBtn: { paddingVertical: Spacing.sm },
  linkBtnText: { fontSize: Typography.fontSize.md, color: Colors.accent },
  previewContainer: { flex: 1, position: 'relative' },
  previewImage: { width: '100%', height: '100%' },
  previewOverlay: { position: 'absolute', bottom: Spacing.lg, left: Spacing.lg, right: Spacing.lg },
  gpsPill: { backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 8, alignSelf: 'flex-start' },
  gpsPillText: { color: '#fff', fontSize: Typography.fontSize.sm },
  previewActions: {
    flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg,
    backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  secondaryButton: {
    flex: 1, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: BorderRadius.lg, paddingVertical: 14, alignItems: 'center',
  },
  secondaryButtonText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.medium, color: Colors.textPrimary },
})
