import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { Colors, Typography, Spacing, BorderRadius } from '../../src/lib/theme'
import type { Profile } from '../../src/lib/supabase'

const APP_VERSION = '1.0.0'

export default function ProfileScreen() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setEmail(user.email ?? '')
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) setProfile(data as Profile)
    setLoading(false)
  }

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          setSigningOut(true)
          await supabase.auth.signOut()
          setSigningOut(false)
        },
      },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    )
  }

  const memberSince = profile
    ? new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : '—'

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {profile?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text style={styles.displayName}>{profile?.display_name ?? 'User'}</Text>
          <Text style={styles.email}>{email}</Text>
          <View style={styles.memberRow}>
            <Text style={styles.memberText}>Member since {memberSince}</Text>
            {profile?.role !== 'user' && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{profile?.role?.toUpperCase()}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Permissions section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Permissions</Text>
          <PermissionRow
            icon="📷" label="Camera"
            desc="Used to photograph road damage when submitting a report."
          />
          <PermissionRow
            icon="🖼️" label="Photo Library"
            desc="Used to select existing images from your gallery for a report."
          />
          <PermissionRow
            icon="📍" label="Location"
            desc="Used to pinpoint the exact location of reported road damage. Not tracked in background."
          />
        </View>

        {/* Data & privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data & Privacy</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              Your name and email are stored securely in our database. Your location is recorded only when you submit a complaint. Photos you upload are stored privately and accessible only to you and administrators reviewing your report.
            </Text>
            <Text style={styles.infoText}>
              Your complaints are visible on the public map without your personal details — only the location and damage type are shown.
            </Text>
          </View>
        </View>

        {/* Disclaimer */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About RoadGuard</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              RoadGuard is a community reporting tool. Reports are reviewed by administrators. This app is not directly connected to a municipal authority. AI detection results are one input — administrator verification is always required before any repair action.
            </Text>
          </View>
        </View>

        {/* Sign out */}
        <View style={styles.section}>
          <TouchableOpacity
            id="btn-sign-out"
            style={[styles.signOutButton, signingOut && styles.buttonDisabled]}
            onPress={handleSignOut}
            disabled={signingOut}
            activeOpacity={0.8}
          >
            {signingOut
              ? <ActivityIndicator color={Colors.statusRejected} />
              : <Text style={styles.signOutText}>Sign Out</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Version */}
        <Text style={styles.version}>RoadGuard v{APP_VERSION}</Text>
        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function PermissionRow({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <View style={styles.permissionRow}>
      <Text style={styles.permissionIcon}>{icon}</Text>
      <View style={styles.permissionContent}>
        <Text style={styles.permissionLabel}>{label}</Text>
        <Text style={styles.permissionDesc}>{desc}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  profileHeader: {
    alignItems: 'center', paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.accentLight, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.accent, marginBottom: Spacing.md,
  },
  avatarText: { fontSize: 32, fontWeight: Typography.fontWeight.bold, color: Colors.accent },
  displayName: { fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.textPrimary },
  email: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  memberText: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary },
  roleBadge: {
    backgroundColor: Colors.accentLight, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  roleBadgeText: { fontSize: Typography.fontSize.xs, color: Colors.accent, fontWeight: Typography.fontWeight.bold },
  section: { padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  sectionTitle: {
    fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.md,
  },
  permissionRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  permissionIcon: { fontSize: 24, marginTop: 2 },
  permissionContent: { flex: 1 },
  permissionLabel: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.medium, color: Colors.textPrimary },
  permissionDesc: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginTop: 2, lineHeight: 20 },
  infoCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  infoText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  signOutButton: {
    borderWidth: 1.5, borderColor: Colors.statusRejected, borderRadius: BorderRadius.lg,
    paddingVertical: 14, alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  signOutText: { fontSize: Typography.fontSize.md, fontWeight: Typography.fontWeight.semibold, color: Colors.statusRejected },
  version: { textAlign: 'center', fontSize: Typography.fontSize.xs, color: Colors.textTertiary, paddingTop: Spacing.lg },
})
