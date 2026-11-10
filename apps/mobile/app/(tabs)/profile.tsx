import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, Alert, TextInput, Modal, BackHandler,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useFocusEffect } from 'expo-router'
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

  // Edit profile state
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [editError, setEditError] = useState('')

  // Android Back Handler: return to Home tab
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (editModalVisible) {
          setEditModalVisible(false)
          return true
        }
        router.replace('/(tabs)/')
        return true
      }
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress)
      return () => subscription.remove()
    }, [router, editModalVisible])
  )

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setEmail(user.email ?? '')
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) {
      setProfile(data as Profile)
      setEditDisplayName(data.display_name ?? '')
      setEditPhone(data.phone ?? '')
    }
    setLoading(false)
  }

  const handleOpenEdit = () => {
    if (profile) {
      setEditDisplayName(profile.display_name ?? '')
      setEditPhone(profile.phone ?? '')
    }
    setEditError('')
    setEditModalVisible(true)
  }

  const handleSaveProfile = async () => {
    if (!editDisplayName.trim()) {
      setEditError('Display name cannot be empty.')
      return
    }

    setSavingProfile(true)
    setEditError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // 1. Update profiles table (only permitted fields)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          display_name: editDisplayName.trim(),
          phone: editPhone.trim() || null,
        })
        .eq('id', user.id)

      if (profileError) throw profileError

      // 2. Also update auth user metadata
      await supabase.auth.updateUser({
        data: { display_name: editDisplayName.trim() },
      })

      // Refresh local state
      setProfile(prev => prev ? {
        ...prev,
        display_name: editDisplayName.trim(),
        phone: editPhone.trim() || null,
      } : null)

      setEditModalVisible(false)
      Alert.alert('Success', 'Profile updated successfully.')
    } catch (err: any) {
      setEditError(err?.message ?? 'Failed to update profile.')
    } finally {
      setSavingProfile(false)
    }
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
          {profile?.phone && <Text style={styles.phoneText}>📞 {profile.phone}</Text>}
          <View style={styles.memberRow}>
            <Text style={styles.memberText}>Member since {memberSince}</Text>
            <View style={[styles.roleBadge, profile?.role === 'admin' && styles.roleBadgeAdmin]}>
              <Text style={styles.roleBadgeText}>{(profile?.role ?? 'citizen').toUpperCase()}</Text>
            </View>
          </View>

          {/* Edit profile button */}
          <TouchableOpacity
            id="btn-edit-profile"
            style={styles.editProfileButton}
            onPress={handleOpenEdit}
            activeOpacity={0.8}
          >
            <Text style={styles.editProfileButtonText}>✏️ Edit Profile</Text>
          </TouchableOpacity>
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

      {/* Edit Profile Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Text style={styles.modalSubtitle}>Update your display name and contact phone number.</Text>

            <View style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  id="input-edit-name"
                  style={styles.modalInput}
                  value={editDisplayName}
                  onChangeText={setEditDisplayName}
                  placeholder="Your full name"
                  placeholderTextColor={Colors.textTertiary}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number (Optional)</Text>
                <TextInput
                  id="input-edit-phone"
                  style={styles.modalInput}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="phone-pad"
                />
              </View>

              {/* Protected field note */}
              <View style={styles.protectedFieldNote}>
                <Text style={styles.protectedFieldText}>
                  🔒 Role: <Text style={{ fontWeight: 'bold' }}>{profile?.role ?? 'citizen'}</Text> (Assigned by system/administrator — cannot be changed)
                </Text>
              </View>

              {!!editError && (
                <View style={styles.modalErrorContainer}>
                  <Text style={styles.modalErrorText}>{editError}</Text>
                </View>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  id="btn-cancel-edit"
                  style={styles.modalCancelButton}
                  onPress={() => setEditModalVisible(false)}
                  disabled={savingProfile}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  id="btn-save-edit"
                  style={[styles.modalSaveButton, savingProfile && styles.buttonDisabled]}
                  onPress={handleSaveProfile}
                  disabled={savingProfile}
                >
                  {savingProfile ? (
                    <ActivityIndicator color={Colors.textInverse} size="small" />
                  ) : (
                    <Text style={styles.modalSaveButtonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function PermissionRow({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <View style={styles.permissionRow}>
      <Text style={styles.permissionIcon}>{icon}</Text>
      <View style={styles.permissionInfo}>
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
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textInverse,
  },
  displayName: {
    fontSize: Typography.fontSize.xxl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
  },
  email: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  phoneText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  memberText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleBadgeAdmin: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
  },
  editProfileButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editProfileButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textPrimary,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  permissionIcon: { fontSize: 22, marginTop: 2 },
  permissionInfo: { flex: 1 },
  permissionLabel: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textPrimary,
  },
  permissionDesc: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  infoText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  signOutButton: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.statusRejected,
  },
  buttonDisabled: { opacity: 0.6 },
  signOutText: {
    fontSize: Typography.fontSize.md,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.statusRejected,
  },
  version: {
    textAlign: 'center',
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginTop: Spacing.xl,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  modalForm: {
    gap: Spacing.md,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  inputLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },
  modalInput: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  protectedFieldNote: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  protectedFieldText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
  },
  modalErrorContainer: {
    backgroundColor: '#FEF2F2',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  modalErrorText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.statusRejected,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textPrimary,
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  modalSaveButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textInverse,
  },
})
