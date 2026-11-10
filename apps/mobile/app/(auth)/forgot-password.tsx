import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  BackHandler,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { Colors, Typography, Spacing, BorderRadius } from '../../src/lib/theme'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  // Android hardware back handler: return to sign in
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

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Please enter your email address.')
      return
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase()
      )

      if (resetError) {
        setError(resetError.message)
      } else {
        setSent(true)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send password reset email.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>📧</Text>
          <Text style={styles.title}>Check your inbox</Text>
          <Text style={styles.subtitle}>
            We've sent password reset instructions to{' '}
            <Text style={styles.emailHighlight}>{email.trim().toLowerCase()}</Text>.
          </Text>
          <TouchableOpacity
            id="btn-back-to-signin"
            style={styles.primaryButton}
            onPress={() => router.replace('/(auth)/sign-in')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Return to Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            id="btn-back-from-forgot"
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>
              Enter your registered email address and we'll send you instructions to reset your password.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                id="input-forgot-email"
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textTertiary}
                value={email}
                onChangeText={(t) => {
                  setEmail(t)
                  if (error) setError('')
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleReset}
              />
            </View>

            {!!error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              id="btn-reset-submit"
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.primaryButtonText}>Send Reset Link</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Remember your password? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')}>
              <Text style={styles.linkText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  backButton: {
    marginBottom: Spacing.lg,
  },
  backButtonText: {
    fontSize: Typography.fontSize.md,
    color: Colors.accent,
    fontWeight: Typography.fontWeight.medium,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: Typography.fontSize.xxxl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  form: {
    gap: Spacing.md,
    flex: 1,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.statusRejected,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textInverse,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: Spacing.xl,
  },
  footerText: {
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
  },
  linkText: {
    fontSize: Typography.fontSize.md,
    color: Colors.accent,
    fontWeight: Typography.fontWeight.medium,
  },
  successContainer: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successIcon: {
    fontSize: 56,
    marginBottom: Spacing.lg,
  },
  emailHighlight: {
    color: Colors.accent,
    fontWeight: Typography.fontWeight.semibold,
  },
})
