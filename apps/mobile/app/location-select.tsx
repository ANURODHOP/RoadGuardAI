import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Dimensions, Alert, BackHandler,
} from 'react-native'
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps'
import * as Location from 'expo-location'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../src/lib/theme'

const { width } = Dimensions.get('window')

export default function LocationSelectScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    imageUri: string
    lat: string
    lon: string
    accuracy: string
    detectionState: string
    detectionConfidence: string
  }>()

  const mapRef = useRef<MapView>(null)

  // Initial coordinates parsed from params or fallback to Bangalore / default city
  const initialLat = parseFloat(params.lat || '0')
  const initialLon = parseFloat(params.lon || '0')
  const hasInitialGps = !isNaN(initialLat) && initialLat !== 0 && !isNaN(initialLon) && initialLon !== 0

  const [currentGps, setCurrentGps] = useState<{ lat: number; lon: number; accuracy: number | null } | null>(
    hasInitialGps ? { lat: initialLat, lon: initialLon, accuracy: parseFloat(params.accuracy || '10') } : null
  )

  const [selectedCoord, setSelectedCoord] = useState<{ latitude: number; longitude: number }>({
    latitude: hasInitialGps ? initialLat : 12.9716,
    longitude: hasInitialGps ? initialLon : 77.5946,
  })

  const [isManuallyAdjusted, setIsManuallyAdjusted] = useState(!hasInitialGps)
  const [addressLabel, setAddressLabel] = useState<string>('')
  const [geocoding, setGeocoding] = useState(false)
  const [locatingDevice, setLocatingDevice] = useState(false)

  // Android hardware back handler: return to detection results
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

  // Geocode address when coordinates change
  const reverseGeocode = useCallback(async (lat: number, lon: number) => {
    setGeocoding(true)
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon })
      if (results && results[0]) {
        const item = results[0]
        const parts = [item.street, item.subregion || item.district, item.city, item.region].filter(Boolean)
        setAddressLabel(parts.join(', ') || `${lat.toFixed(5)}, ${lon.toFixed(5)}`)
      } else {
        setAddressLabel(`${lat.toFixed(5)}, ${lon.toFixed(5)}`)
      }
    } catch {
      setAddressLabel(`${lat.toFixed(5)}, ${lon.toFixed(5)}`)
    } finally {
      setGeocoding(false)
    }
  }, [])

  // On mount: if no GPS from capture, try to get live location
  useEffect(() => {
    if (hasInitialGps) {
      reverseGeocode(initialLat, initialLon)
    } else {
      recenterToLiveGps()
    }
  }, [])

  const recenterToLiveGps = async () => {
    setLocatingDevice(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission',
          'Location permission was denied. You can tap anywhere on the map or drag the pin to select the complaint location manually.',
        )
        setLocatingDevice(false)
        return
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const newLat = loc.coords.latitude
      const newLon = loc.coords.longitude
      const newAcc = loc.coords.accuracy

      setCurrentGps({ lat: newLat, lon: newLon, accuracy: newAcc })
      setSelectedCoord({ latitude: newLat, longitude: newLon })
      setIsManuallyAdjusted(false)

      mapRef.current?.animateToRegion({
        latitude: newLat,
        longitude: newLon,
        latitudeDelta: 0.004,
        longitudeDelta: 0.004,
      }, 600)

      reverseGeocode(newLat, newLon)
    } catch (e: any) {
      Alert.alert('GPS Notice', 'Could not obtain device location. Please select the location on the map manually.')
    } finally {
      setLocatingDevice(false)
    }
  }

  // Handle map tap or marker drag
  const handleMapPress = (coordinate: { latitude: number; longitude: number }) => {
    setSelectedCoord(coordinate)
    setIsManuallyAdjusted(true)
    reverseGeocode(coordinate.latitude, coordinate.longitude)
  }

  const handleConfirmLocation = () => {
    router.push({
      pathname: '/duplicate-check',
      params: {
        imageUri: params.imageUri,
        lat: selectedCoord.latitude.toString(),
        lon: selectedCoord.longitude.toString(),
        accuracy: isManuallyAdjusted ? '' : (currentGps?.accuracy?.toString() ?? ''),
        isManual: isManuallyAdjusted ? 'true' : 'false',
        addressLabel: addressLabel,
        detectionState: params.detectionState,
        detectionConfidence: params.detectionConfidence,
      },
    })
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          id="btn-back-location-select"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pinpoint Hazard Location</Text>
      </View>

      {/* Interactive Map */}
      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={{
            latitude: selectedCoord.latitude,
            longitude: selectedCoord.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }}
          onPress={(e) => handleMapPress(e.nativeEvent.coordinate)}
          showsUserLocation={true}
          showsMyLocationButton={false}
        >
          <UrlTile
            urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maximumZ={19}
            flipY={false}
          />

          {/* Selected complaint pin (draggable) */}
          <Marker
            coordinate={selectedCoord}
            draggable
            onDragEnd={(e) => handleMapPress(e.nativeEvent.coordinate)}
            pinColor={isManuallyAdjusted ? '#D97706' : Colors.accent}
            title="Complaint Location"
            description={isManuallyAdjusted ? 'Manually adjusted pin' : 'GPS verified location'}
          />
        </MapView>

        {/* Map tip overlay */}
        <View style={styles.tipOverlay}>
          <Text style={styles.tipText}>
            💡 Tap map or drag the pin to adjust exact pothole location
          </Text>
        </View>

        {/* Recenter GPS button */}
        <TouchableOpacity
          id="btn-recenter-gps"
          style={[styles.recenterButton, Shadows.md]}
          onPress={recenterToLiveGps}
          disabled={locatingDevice}
          activeOpacity={0.8}
        >
          {locatingDevice ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Text style={styles.recenterIcon}>🎯</Text>
          )}
        </TouchableOpacity>

        {/* OSM Attribution */}
        <View style={styles.attribution}>
          <Text style={styles.attributionText}>© OpenStreetMap contributors</Text>
        </View>
      </View>

      {/* Bottom confirmation card */}
      <View style={[styles.bottomCard, Shadows.lg]}>
        {/* Verification badge */}
        <View style={styles.badgeRow}>
          <View style={[
            styles.statusPill,
            isManuallyAdjusted ? styles.statusPillManual : styles.statusPillGps
          ]}>
            <Text style={[
              styles.statusPillText,
              isManuallyAdjusted ? styles.statusPillTextManual : styles.statusPillTextGps
            ]}>
              {isManuallyAdjusted
                ? '✋ Manually Adjusted Location'
                : `📍 GPS Verified (±${Math.round(currentGps?.accuracy ?? 10)}m)`}
            </Text>
          </View>
        </View>

        {/* Address display */}
        <View style={styles.addressRow}>
          <Text style={styles.addressIcon}>📌</Text>
          <View style={styles.addressTextContainer}>
            {geocoding ? (
              <Text style={styles.addressTextMuted}>Finding street address...</Text>
            ) : (
              <Text style={styles.addressText} numberOfLines={2}>
                {addressLabel || `${selectedCoord.latitude.toFixed(5)}, ${selectedCoord.longitude.toFixed(5)}`}
              </Text>
            )}
            <Text style={styles.coordsText}>
              Lat: {selectedCoord.latitude.toFixed(6)}, Lon: {selectedCoord.longitude.toFixed(6)}
            </Text>
          </View>
        </View>

        {/* Confirm action button */}
        <TouchableOpacity
          id="btn-confirm-location"
          style={styles.confirmButton}
          onPress={handleConfirmLocation}
          activeOpacity={0.85}
        >
          <Text style={styles.confirmButtonText}>Confirm Location & Check Nearby →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backButton: { paddingVertical: 4 },
  backText: {
    fontSize: Typography.fontSize.md,
    color: Colors.accent,
    fontWeight: Typography.fontWeight.medium,
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  tipOverlay: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  tipText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textPrimary,
    fontWeight: Typography.fontWeight.medium,
  },
  recenterButton: {
    position: 'absolute',
    bottom: Spacing.lg,
    right: Spacing.lg,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recenterIcon: {
    fontSize: 22,
  },
  attribution: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  attributionText: {
    fontSize: 9,
    color: Colors.textSecondary,
  },
  bottomCard: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusPillGps: {
    backgroundColor: '#DCFCE7',
  },
  statusPillManual: {
    backgroundColor: '#FEF3C7',
  },
  statusPillText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
  },
  statusPillTextGps: {
    color: '#166534',
  },
  statusPillTextManual: {
    color: '#B45309',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: 2,
  },
  addressIcon: {
    fontSize: 18,
    marginTop: 2,
  },
  addressTextContainer: {
    flex: 1,
  },
  addressText: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  addressTextMuted: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textTertiary,
    fontStyle: 'italic',
  },
  coordsText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    fontFamily: 'monospace',
    marginTop: 3,
  },
  confirmButton: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  confirmButtonText: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textInverse,
  },
})
