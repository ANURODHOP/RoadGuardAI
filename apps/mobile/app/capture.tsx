import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  Alert, ActivityIndicator, Image, Dimensions, BackHandler, Linking,
} from 'react-native'
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { useRouter } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import { Colors, Typography, Spacing, BorderRadius } from '../src/lib/theme'

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

  // Android hardware back handler:
  // If previewing image -> cancel preview and return to viewfinder
  // If in camera/gallery mode -> return to main tabs
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (capturedUri) {
          setCapturedUri(null)
          setGpsStatus('idle')
          setLocation(null)
          return true
        }
        router.replace('/(tabs)/')
        return true
      }
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress)
      return () => subscription.remove()
    }, [capturedUri, router])
  )

  useEffect(() => {
    if (!cameraPermission?.granted) {
      requestCameraPermission()
    }
    initLocation()
  }, [])

  const initLocation = async () => {
    try {
      const hasServices = await Location.hasServicesEnabledAsync()
      if (!hasServices) {
        setGpsStatus('unavailable')
        return
      }
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        captureGPS()
      } else {
        setGpsStatus('unavailable')
      }
    } catch {
      setGpsStatus('unavailable')
    }
  }

  const captureGPS = async () => {
    setGpsStatus('locating')
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setGpsStatus('unavailable')
        return
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 6000,
      })
      setLocation({
        lat: loc.coords.latitude,
        lon: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
      })
      setGpsStatus('found')
    } catch {
      setGpsStatus('unavailable')
    }
  }

  const processImage = async (uri: string): Promise<string> => {
    // Resize to max 1024px, fix orientation, compress to JPEG
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.85, format: SaveFormat.JPEG },
    )
    return result.uri
  }

  const takePicture = async () => {
    if (!cameraRef.current || processing) return
    setProcessing(true)
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        exif: false,
      })
      if (photo?.uri) {
        const processed = await processImage(photo.uri)
        setCapturedUri(processed)
        if (gpsStatus !== 'found') {
          captureGPS()
        }
      }
    } catch (e: any) {
      Alert.alert('Camera Error', 'Could not capture photo. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  const pickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Photo Library Access Required',
          'Please allow photo library access in Settings to select images.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        )
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      })

      if (!result.canceled && result.assets[0]?.uri) {
        setProcessing(true)
        const processed = await processImage(result.assets[0].uri)
        setCapturedUri(processed)
        if (gpsStatus !== 'found') {
          captureGPS()
        }
      }
    } catch (err: any) {
      Alert.alert('Gallery Error', 'Failed to pick image from gallery.')
    } finally {
      setProcessing(false)
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
      case 'locating': return '📡 Obtaining GPS location...'
      case 'found': return `✅ GPS Verified (±${Math.round(location?.accuracy ?? 0)}m)`
      case 'unavailable': return '⚠️ Location unavailable (Manual map selection on next step)'
      default: return '📍 Location capturing...'
    }
  }

  // ── Preview mode ────────────────────────────────────────────
  if (capturedUri) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedUri }} style={styles.previewImage} resizeMode="cover" />
          <View style={styles.previewOverlay}>
            <View style={styles.gpsPill}>
              <Text style={styles.gpsPillText}>{gpsLabel()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.previewActions}>
          <TouchableOpacity
            id="btn-retake"
            style={styles.secondaryButton}
            onPress={() => {
              setCapturedUri(null)
              setGpsStatus('idle')
              setLocation(null)
            }}
          >
            <Text style={styles.secondaryButtonText}>Retake Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            id="btn-use-photo"
            style={styles.primaryButton}
            onPress={handleContinue}
          >
            <Text style={styles.primaryButtonText}>Analyze Road Damage →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── Camera mode ────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* Top mode bar */}
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
        <TouchableOpacity
          id="btn-close-capture"
          style={styles.closeBtn}
          onPress={() => router.replace('/(tabs)/')}
        >
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
                <Text style={styles.guideText}>Center the pothole or road damage</Text>
              </View>

              {/* Shutter controls */}
              <View style={styles.shutterRow}>
                <TouchableOpacity
                  style={styles.flipBtn}
                  onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.flipBtnText}>🔄</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  id="btn-shutter"
                  style={styles.shutterBtn}
                  onPress={takePicture}
                  disabled={processing}
                >
                  {processing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <View style={styles.shutterInner} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.galleryShortcutBtn}
                  onPress={pickFromGallery}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.flipBtnText}>🖼️</Text>
                </TouchableOpacity>
              </View>
            </CameraView>
          ) : (
            <View style={styles.permissionContainer}>
              <Text style={styles.permissionIcon}>📷</Text>
              <Text style={styles.permissionTitle}>Camera Access Required</Text>
              <Text style={styles.permissionDesc}>
                RoadGuard needs camera permissions to photograph potholes and road damage.
              </Text>
              <TouchableOpacity
                id="btn-grant-camera-permission"
                style={styles.primaryButton}
                onPress={requestCameraPermission}
              >
                <Text style={styles.primaryButtonText}>Grant Camera Permission</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => Linking.openSettings()}
              >
                <Text style={styles.settingsButtonText}>Open Device Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                id="btn-choose-gallery-fallback"
                style={styles.linkBtn}
                onPress={pickFromGallery}
              >
                <Text style={styles.linkBtnText}>Choose from photo gallery instead</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {mode === 'gallery' && (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionIcon}>🖼️</Text>
          <Text style={styles.permissionTitle}>Gallery Selection</Text>
          <Text style={styles.permissionDesc}>
            Select a photo of the road damage from your device's photo library.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={pickFromGallery}>
            <Text style={styles.primaryButtonText}>Open Photo Library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkBtn} onPress={() => setMode('camera')}>
            <Text style={styles.linkBtnText}>Switch back to Camera</Text>
          </TouchableOpacity>
        </View>
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
    width: width * 0.75, height: width * 0.75 * 0.75,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: BorderRadius.lg,
  },
  guideText: { color: 'rgba(255,255,255,0.9)', fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium },
  shutterRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl,
  },
  shutterBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 3, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  flipBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  galleryShortcutBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  flipBtnText: { fontSize: 20 },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: Spacing.md, backgroundColor: Colors.background },
  permissionIcon: { fontSize: 64 },
  permissionTitle: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  permissionDesc: { fontSize: Typography.fontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  primaryButton: { backgroundColor: Colors.accent, borderRadius: BorderRadius.lg, paddingVertical: 14, paddingHorizontal: Spacing.xl, alignItems: 'center', width: '100%' },
  primaryButtonText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: '#fff' },
  settingsButton: {
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.lg, paddingVertical: 12, paddingHorizontal: Spacing.xl,
    alignItems: 'center', width: '100%',
  },
  settingsButtonText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.textPrimary },
  linkBtn: { paddingVertical: Spacing.sm },
  linkBtnText: { fontSize: Typography.fontSize.md, color: Colors.accent },
  previewContainer: { flex: 1, position: 'relative' },
  previewImage: { width: '100%', height: '100%' },
  previewOverlay: { position: 'absolute', bottom: Spacing.lg, left: Spacing.lg, right: Spacing.lg },
  gpsPill: { backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 8, alignSelf: 'flex-start' },
  gpsPillText: { color: '#fff', fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.medium },
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
