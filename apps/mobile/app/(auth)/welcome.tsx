import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Dimensions,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Colors, Typography, Spacing, BorderRadius } from '../../src/lib/theme'

const { width, height } = Dimensions.get('window')

export default function WelcomeScreen() {
  const router = useRouter()

  return (
    <SafeAreaView style={styles.container}>
      {/* Background pattern */}
      <View style={styles.backgroundPattern} />

      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoMark}>
            <Text style={styles.logoIcon}>🛣️</Text>
          </View>
          <Text style={styles.logoText}>RoadGuard</Text>
          <Text style={styles.logoTagline}>Community Road Safety</Text>
        </View>

        {/* Illustration area */}
        <View style={styles.illustrationContainer}>
          <View style={styles.illustrationCard}>
            <Text style={styles.illustrationEmoji}>📍</Text>
            <Text style={styles.illustrationTitle}>Report Road Damage</Text>
            <Text style={styles.illustrationDesc}>
              Photograph potholes, cracks, and road hazards near you.
              AI detects damage offline — no internet required for analysis.
            </Text>
          </View>

          <View style={[styles.illustrationCard, styles.illustrationCardSecondary]}>
            <Text style={styles.illustrationEmoji}>📊</Text>
            <Text style={styles.illustrationTitle}>Track Progress</Text>
            <Text style={styles.illustrationDesc}>
              Follow your complaint from submission to resolution.
            </Text>
          </View>
        </View>

        {/* Notice */}
        <View style={styles.noticeContainer}>
          <Text style={styles.noticeText}>
            🔒 Your reports are anonymous on the map. Location and image are used only to describe the damage.
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            id="btn-get-started"
            style={styles.primaryButton}
            onPress={() => router.push('/(auth)/sign-up')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </TouchableOpacity>

          <TouchableOpacity
            id="btn-sign-in"
            style={styles.secondaryButton}
            onPress={() => router.push('/(auth)/sign-in')}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  backgroundPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.4,
    backgroundColor: Colors.accentLight,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    justifyContent: 'space-between',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  logoIcon: {
    fontSize: 32,
  },
  logoText: {
    fontSize: Typography.fontSize.xxl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  logoTagline: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  illustrationContainer: {
    gap: Spacing.md,
  },
  illustrationCard: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  illustrationCardSecondary: {
    backgroundColor: Colors.surface,
  },
  illustrationEmoji: {
    fontSize: 28,
    marginBottom: Spacing.sm,
  },
  illustrationTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  illustrationDesc: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  noticeContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noticeText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
  },
  actionsContainer: {
    gap: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  primaryButton: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textInverse,
  },
  secondaryButton: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  secondaryButtonText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textPrimary,
  },
})
