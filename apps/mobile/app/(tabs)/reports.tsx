import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { Colors, Typography, Spacing, BorderRadius, getStatusColor } from '../../src/lib/theme'
import type { Complaint, ComplaintStatus } from '../../src/lib/supabase'

const STATUS_FILTERS: { label: string; value: ComplaintStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending_verification' },
  { label: 'Verified', value: 'verified' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Resolved', value: 'resolved' },
]

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function ReportsScreen() {
  const router = useRouter()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [filtered, setFiltered] = useState<Complaint[]>([])
  const [activeFilter, setActiveFilter] = useState<ComplaintStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadComplaints = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('complaints')
      .select('*')
      .eq('reporter_id', user.id)
      .order('created_at', { ascending: false })
    if (!error && data) {
      setComplaints(data as Complaint[])
      applyFilter(data as Complaint[], activeFilter)
    }
  }, [activeFilter])

  useEffect(() => {
    setLoading(true)
    loadComplaints().finally(() => setLoading(false))
  }, [])

  const applyFilter = (data: Complaint[], status: ComplaintStatus | 'all') => {
    setActiveFilter(status)
    if (status === 'all') setFiltered(data)
    else setFiltered(data.filter(c => c.complaint_status === status))
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadComplaints()
    setRefreshing(false)
  }

  const renderItem = ({ item }: { item: Complaint }) => {
    const statusInfo = getStatusColor(item.complaint_status)
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/complaint/${item.id}`)}
        activeOpacity={0.75}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardId}>#{item.id.slice(0, 8).toUpperCase()}</Text>
          <View style={[styles.statusChip, { backgroundColor: statusInfo.bg }]}>
            <Text style={[styles.statusChipText, { color: statusInfo.text }]}>{statusInfo.label}</Text>
          </View>
        </View>
        <Text style={styles.cardDamageType}>{item.damage_type?.replace('_', ' ')}</Text>
        {item.address_label ? (
          <Text style={styles.cardLocation} numberOfLines={1}>📍 {item.address_label}</Text>
        ) : (
          <Text style={styles.cardLocation}>
            📍 {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
          </Text>
        )}
        <View style={styles.cardFooter}>
          <Text style={styles.cardTime}>{timeAgo(item.created_at)}</Text>
          {item.detection_confidence !== null && (
            <Text style={styles.cardConf}>
              AI: {Math.round((item.detection_confidence ?? 0) * 100)}%
            </Text>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Reports</Text>
        <Text style={styles.subtitle}>{complaints.length} total report{complaints.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* Filter bar */}
      <View style={styles.filterBar}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            id={`filter-${f.value}`}
            style={[styles.filterBtn, activeFilter === f.value && styles.filterBtnActive]}
            onPress={() => applyFilter(complaints, f.value)}
          >
            <Text style={[styles.filterBtnText, activeFilter === f.value && styles.filterBtnTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.accent} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No reports yet</Text>
              <Text style={styles.emptyDesc}>
                {activeFilter === 'all'
                  ? "You haven't submitted any road damage reports yet."
                  : `No reports with status "${getStatusColor(activeFilter as string).label}".`}
              </Text>
              {activeFilter === 'all' && (
                <TouchableOpacity
                  id="btn-report-from-empty"
                  style={styles.emptyButton}
                  onPress={() => router.push('/capture')}
                >
                  <Text style={styles.emptyButtonText}>Report Damage</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  filterBar: {
    flexDirection: 'row', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    gap: Spacing.xs, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  filterBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterBtnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filterBtnText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.medium, color: Colors.textSecondary },
  filterBtnTextActive: { color: Colors.textInverse },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: Spacing.lg, gap: Spacing.md },
  emptyContainer: { flex: 1 },
  card: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  cardId: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.textTertiary, letterSpacing: 0.5 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  statusChipText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardDamageType: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: Colors.textPrimary, textTransform: 'capitalize', marginBottom: 4 },
  cardLocation: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTime: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary },
  cardConf: { fontSize: Typography.fontSize.xs, color: Colors.textSecondary, fontStyle: 'italic' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl, gap: Spacing.md },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  emptyDesc: { fontSize: Typography.fontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  emptyButton: {
    backgroundColor: Colors.accent, borderRadius: BorderRadius.lg,
    paddingVertical: 14, paddingHorizontal: Spacing.xl, marginTop: Spacing.md,
  },
  emptyButtonText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: Colors.textInverse },
})
