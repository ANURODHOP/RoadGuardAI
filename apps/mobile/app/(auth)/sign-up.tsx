import React, { useRef, useState } from 'react'
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
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../src/lib/supabase'
import { Colors, Typography, Spacing, BorderRadius } from '../../src/lib/theme'

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(
  displayName: string,
  email: string,
  password: string,
  confirmPassword: string,
): string | null {
  if (!displayName.trim()) {
    return 'Display name is required.'
  }
  if (!EMAIL_REGEX.test(email.trim())) {
    return 'Please enter a valid email address.'
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters.'
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match.'
  }
  return null
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function SignUpScreen() {
  const router = useRouter()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Refs for sequential focus on keyboard "next"
  const emailRef = useRef<React.ElementRef<typeof TextInput>>(null)
  const passwordRef = useRef<React.ElementRef<typeof TextInput>>(null)
  const confirmPasswordRef = useRef<React.ElementRef<typeof TextInput>>(null)

  const handleSignUp = async () => {
    const validationError = validate(displayName, email, password, confirmPassword)
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setLoading(true)

    const { error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          display_name: displayName.trim(),
        },
      },
    })

    setLoading(false)

    if (authError) {
      setError(authError.message)
    } else {
      setSuccess(true)
    }
  }

  // ---------------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------------
  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.successScroll}>
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✉️</Text>
            <Text style={styles.successTitle}>Check your email</Text>
            <Text style={styles.successBody}>
              We sent a confirmation link to{' '}
              <Text style={styles.successEmail}>{email.trim().toLowerCase()}</Text>.
              {'\n\n'}
              Click the link in that email to activate your account, then come back to sign in.
            </Text>
            <TouchableOpacity
              id="btn-goto-signin-after-signup"
              style={styles.primaryButton}
              onPress={() => router.replace('/(auth)/sign-in')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Go to Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ---------------------------------------------------------------------------
  // Form state
  // ---------------------------------------------------------------------------
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
          {/* Back button */}
          <TouchableOpacity
            id="btn-back-from-signup"
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>
              Join RoadGuard and start reporting road damage in your community
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>

            {/* Display Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Display name</Text>
              <TextInput
                id="input-signup-display-name"
                style={styles.input}
                placeholder="Your full name or nickname"
                placeholderTextColor={Colors.textTertiary}
                value={displayName}
                onChangeText={(text) => {
                  setDisplayName(text)
                  if (error) setError('')
                }}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                id="input-signup-email"
                ref={emailRef}
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textTertiary}
                value={email}
                onChangeText={(text) => {
                  setEmail(text)
                  if (error) setError('')
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                id="input-signup-password"
                ref={passwordRef}
                style={styles.input}
                placeholder="At least 8 characters"
                placeholderTextColor={Colors.textTertiary}
                value={password}
                onChangeText={(text) => {
                  setPassword(text)
                  if (error) setError('')
                }}
                secureTextEntry
                returnKeyType="next"
                onSubmitEditing={() => confirmPasswordRef.current?.focus()}
              />
            </View>

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm password</Text>
              <TextInput
                id="input-signup-confirm-password"
                ref={confirmPasswordRef}
                style={styles.input}
                placeholder="Re-enter your password"
                placeholderTextColor={Colors.textTertiary}
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text)
                  if (error) setError('')
                }}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
              />
            </View>

            {/* Error banner */}
            {!!error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Submit */}
            <TouchableOpacity
              id="btn-signup-submit"
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.primaryButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity
              id="btn-goto-signin-from-signup"
              onPress={() => router.replace('/(auth)/sign-in')}
            >
              <Text style={styles.linkText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
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
  successScroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    justifyContent: 'center',
  },

  // ── Back button ────────────────────────────────────────────────────────────
  backButton: {
    marginBottom: Spacing.lg,
  },
  backButtonText: {
    fontSize: Typography.fontSize.md,
    color: Colors.accent,
    fontWeight: Typography.fontWeight.medium,
  },

  // ── Header ─────────────────────────────────────────────────────────────────
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

  // ── Form ───────────────────────────────────────────────────────────────────
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

  // ── Error ──────────────────────────────────────────────────────────────────
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
  },

  // ── Primary button ─────────────────────────────────────────────────────────
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

  // ── Footer ─────────────────────────────────────────────────────────────────
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

  // ── Success card ───────────────────────────────────────────────────────────
  successCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  successIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  successTitle: {
    fontSize: Typography.fontSize.xxl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  successBody: {
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  successEmail: {
    color: Colors.accent,
    fontWeight: Typography.fontWeight.semibold,
  },
})
