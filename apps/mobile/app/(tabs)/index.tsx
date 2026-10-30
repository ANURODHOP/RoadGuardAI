import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase, type Complaint, type NearbyComplaint } from '../../src/lib/supabase'
import {
  Colors,
  Typography,
  Spacing,
  BorderRadius,
  Shadows,
  getStatusColor,
} from '../../src/lib/theme'
import * as Location from 'expo-location'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDamageType(type: string): string {
  const map: Record<string, string> = {
    pothole: 'Pothole',
    crack: 'Road Crack',
    subsidence: 'Subsidence',
    other: 'Other',
  }
  return map[type] ?? type
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const { text, bg, label } = getStatusColor(status)
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color: text }]}>{label}</Text>
    </View>
  )
}

function SummaryCard({
  count,
  label,
  color,
}: {
  count: number
  label: string
  color: string
}) {
  return (
    <View style={[styles.summaryCard, Shadows.sm]}>
      <Text style={[styles.summaryCount, { color }]}>{count}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  )
}

function NearbyReportCard({ item }: { item: NearbyComplaint }) {
  const router = useRouter()
  return (
    <TouchableOpacity
      style={[styles.reportCard, Shadows.sm]}
      activeOpacity={0.75}
      onPress={() => router.push(`/complaint/${item.id}`)}
    >
      <View style={styles.reportCardRow}>
        <Text style={styles.reportCardType}>{formatDamageType(item.damage_type)}</Text>
        <StatusChip status={item.complaint_status} />
      </View>
      <Text style={styles.reportCardMeta}>
        {item.address_label ?? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`}
      </Text>
      <View style={styles.reportCardFooter}>
        <Text style={styles.reportCardDistance}>
          {item.distance_meters < 1000
            ? `${Math.round(item.distance_meters)} m away`
            : `${(item.distance_meters / 1000).toFixed(1)} km away`}
        </Text>
        <Text style={styles.reportCardTime}>{timeAgo(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  )
}

function MyReportCard({ item }: { item: Complaint }) {
  const router = useRouter()
  return (
    <TouchableOpacity
      style={[styles.reportCard, Shadows.sm]}
      activeOpacity={0.75}
      onPress={() => router.push(`/complaint/${item.id}`)}
    >
      <View style={styles.reportCardRow}>
        <Text style={styles.reportCardType}>{formatDamageType(item.damage_type)}</Text>
        <StatusChip status={item.complaint_status} />
      </View>
      <Text style={styles.reportCardMeta}>
        {item.address_label ?? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`}
      </Text>
      <Text style={styles.reportCardTime}>{timeAgo(item.created_at)}</Text>
    </TouchableOpacity>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>{message}</Text>
    </View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter()

  const [displayName, setDisplayName] = useState<string>('')
  const [nearbyReports, setNearbyReports] = useState<NearbyComplaint[]>([])
  const [myReports, setMyReports] = useState<Complaint[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [resolvedCount, setResolvedCount] = useState(0)
  const [loadingNearby, setLoadingNearby] = useState(true)
  const [loadingMine, setLoadingMine] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userLocation, setUserLocation] =
    useState<{ lat: number; lon: number } | null>(null)

  // Fetch user profile
  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
    if (data?.display_name) setDisplayName(data.display_name)
  }, [])

  // Fetch nearby complaints within ~5 km using simple bounding-box filter
  const fetchNearby = useCallback(async (lat: number, lon: number) => {
    setLoadingNearby(true)
    try {
      // ~5 km ≈ 0.045° latitude / 0.055° longitude at typical urban latitudes
      const delta = 0.045
      const { data, error } = await supabase
        .from('complaints')
        .select(
          'id, latitude, longitude, damage_type, complaint_status, verification_status, detection_confidence, address_label, created_at',
        )
        .neq('complaint_status', 'rejected')
        .gte('latitude', lat - delta)
        .lte('latitude', lat + delta)
        .gte('longitude', lon - delta)
        .lte('longitude', lon + delta)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) {
        console.warn('fetchNearby error:', error.message)
        return
      }

      // Compute distance for display
      const withDistance: NearbyComplaint[] = (data ?? []).map((row) => {
        const dlat = ((row.latitude - lat) * Math.PI) / 180
        const dlon = ((row.longitude - lon) * Math.PI) / 180
        const a =
          Math.sin(dlat / 2) ** 2 +
          Math.cos((lat * Math.PI) / 180) *
            Math.cos((row.latitude * Math.PI) / 180) *
            Math.sin(dlon / 2) ** 2
        const distMeters = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return { ...row, distance_meters: distMeters }
      })

      setNearbyReports(withDistance)
    } finally {
      setLoadingNearby(false)
    }
  }, [])

  // Fetch my complaints — paginated, with stats via separate count query
  const fetchMine = useCallback(async () => {
    setLoadingMine(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch recent 3 reports for display
      const { data: recentData, error: recentError } = await supabase
        .from('complaints')
        .select('id, latitude, longitude, address_label, damage_type, complaint_status, detection_confidence, created_at')
        .eq('reporter_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3)

      if (recentError) {
        console.warn('[Home] fetchMine recent error:', recentError.message)
      }
      setMyReports((recentData ?? []) as Complaint[])

      // Fetch counts via count query (no data transfer)
      const { count: total } = await supabase
        .from('complaints')
        .select('id', { count: 'exact', head: true })
        .eq('reporter_id', user.id)

      const { count: pending } = await supabase
        .from('complaints')
        .select('id', { count: 'exact', head: true })
        .eq('reporter_id', user.id)
        .in('complaint_status', ['pending_verification', 'verified', 'assigned', 'in_progress'])

      const { count: resolved } = await supabase
        .from('complaints')
        .select('id', { count: 'exact', head: true })
        .eq('reporter_id', user.id)
        .eq('complaint_status', 'resolved')

      setTotalCount(total ?? 0)
      setPendingCount(pending ?? 0)
      setResolvedCount(resolved ?? 0)
    } finally {
      setLoadingMine(false)
    }
  }, [])

  // Get location then load data
  const init = useCallback(async () => {
    fetchProfile()
    fetchMine()

    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const { latitude: lat, longitude: lon } = loc.coords
        setUserLocation({ lat, lon })
        fetchNearby(lat, lon)
      } else {
        // Fall back: fetch recent global reports without distance
        setLoadingNearby(false)
      }
    } catch {
      setLoadingNearby(false)
    }
  }, [fetchProfile, fetchMine, fetchNearby])

  useEffect(() => {
    init()
  }, [init])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([
      fetchProfile(),
      fetchMine(),
      userLocation
        ? fetchNearby(userLocation.lat, userLocation.lon)
        : Promise.resolve(),
    ])
    setRefreshing(false)
  }, [fetchProfile, fetchMine, fetchNearby, userLocation])

  const greeting = displayName ? `Hello, ${displayName.split(' ')[0]} 👋` : 'Hello there 👋'

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
          />
        }
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>RoadGuard</Text>
          <Text style={styles.headerGreeting}>{greeting}</Text>
        </View>

        {/* ── Summary Row ── */}
        <View style={styles.summaryRow}>
          <SummaryCard count={totalCount} label="Total" color={Colors.textPrimary} />
          <SummaryCard count={pendingCount} label="Active" color={Colors.statusPending} />
          <SummaryCard count={resolvedCount} label="Resolved" color={Colors.statusResolved} />
        </View>

        {/* ── Report CTA ── */}
        <TouchableOpacity
          id="btn-report-pothole"
          style={[styles.reportButton, Shadows.md]}
          activeOpacity={0.85}
          onPress={() => router.push('/capture')}
        >
          <Text style={styles.reportButtonIcon}>📸</Text>
          <Text style={styles.reportButtonText}>Report a Pothole</Text>
        </TouchableOpacity>

        {/* ── Nearby Reports ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nearby Reports</Text>
          {loadingNearby ? (
            <ActivityIndicator size="small" color={Colors.accent} style={styles.loader} />
          ) : nearbyReports.length === 0 ? (
            <EmptyState
              message={
                userLocation
                  ? 'No reports found within 5 km of your location.'
                  : 'Enable location to see nearby reports.'
              }
            />
          ) : (
            nearbyReports.map((item) => <NearbyReportCard key={item.id} item={item} />)
          )}
        </View>

        {/* ── My Active Reports ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Active Reports</Text>
            {totalCount > 3 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/reports')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            )}
          </View>
          {loadingMine ? (
            <ActivityIndicator size="small" color={Colors.accent} style={styles.loader} />
          ) : myReports.length === 0 ? (
            <EmptyState message="You haven't submitted any reports yet." />
          ) : (
            myReports.map((item) => <MyReportCard key={item.id} item={item} />)
          )}
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
  },

  // Header
  header: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: Typography.fontSize.xxl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.accent,
    letterSpacing: -0.5,
  },
  headerGreeting: {
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Summary row
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryCount: {
    fontSize: Typography.fontSize.xxl,
    fontWeight: Typography.fontWeight.bold,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
    fontWeight: Typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Report button
  reportButton: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  reportButtonIcon: {
    fontSize: 22,
  },
  reportButtonText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textInverse,
    letterSpacing: 0.2,
  },

  // Sections
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  seeAll: {
    fontSize: Typography.fontSize.sm,
    color: Colors.accent,
    fontWeight: Typography.fontWeight.medium,
  },

  // Report cards
  reportCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reportCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  reportCardType: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
  },
  reportCardMeta: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 6,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.normal,
  },
  reportCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportCardDistance: {
    fontSize: Typography.fontSize.xs,
    color: Colors.accent,
    fontWeight: Typography.fontWeight.medium,
  },
  reportCardTime: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
  },

  // Status chip
  chip: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
  },

  // Empty state
  emptyState: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  emptyStateText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },

  loader: {
    paddingVertical: Spacing.lg,
  },
  bottomPad: {
    height: Spacing.xxl,
  },
})
