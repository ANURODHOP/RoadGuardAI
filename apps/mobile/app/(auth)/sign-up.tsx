import React, { useRef, useState, useCallback } from 'react'
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
import { useFocusEffect } from '@react-navigation/native'
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
  agreedToTerms: boolean,
): string | null {
  if (!displayName.trim()) {
    return 'Full name is required.'
  }
  if (!email.trim()) {
    return 'Email address is required.'
  }
  if (!EMAIL_REGEX.test(email.trim())) {
    return 'Please enter a valid email address.'
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.'
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match.'
  }
  if (!agreedToTerms) {
    return 'Please agree to the RoadGuard Terms of Service and Privacy Policy to continue.'
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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Android hardware back handler: navigate to welcome
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.replace('/(auth)/welcome')
        return true
      }
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress)
      return () => subscription.remove()
    }, [router])
  )

  // Refs for sequential focus on keyboard "next"
  const emailRef = useRef<React.ElementRef<typeof TextInput>>(null)
  const passwordRef = useRef<React.ElementRef<typeof TextInput>>(null)
  const confirmPasswordRef = useRef<React.ElementRef<typeof TextInput>>(null)

  const handleSignUp = async () => {
    const validationError = validate(displayName, email, password, confirmPassword, agreedToTerms)
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setLoading(true)

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            display_name: displayName.trim(),
          },
        },
      })

      if (authError) {
        if (authError.message.toLowerCase().includes('already registered')) {
          setError('An account with this email already exists. Please sign in instead.')
        } else if (authError.message.toLowerCase().includes('invalid')) {
          setError('Invalid email address format. Please provide a valid email.')
        } else {
          setError(authError.message)
        }
      } else if (data?.session) {
        // Email confirmation is disabled on Supabase, user logged in immediately
        // RootLayout AuthProvider detects session and navigates to (tabs)
      } else {
        // Email confirmation is enabled
        setSuccess(true)
      }
    } catch (err: any) {
      setError(err?.message ?? 'An unexpected error occurred during account creation.')
    } finally {
      setLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Success state (Email Verification required)
  // ---------------------------------------------------------------------------
  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.successScroll}>
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✉️</Text>
            <Text style={styles.successTitle}>Verify your email</Text>
            <Text style={styles.successBody}>
              We sent an account activation link to{' '}
              <Text style={styles.successEmail}>{email.trim().toLowerCase()}</Text>.
              {'\n\n'}
              Please check your email and click the confirmation link to activate your account.
              Once confirmed, return here to sign in.
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
            onPress={() => router.replace('/(auth)/welcome')}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>
              Join RoadGuard to report and track road damage in your community
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>

            {/* Display Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                id="input-signup-display-name"
                style={styles.input}
                placeholder="e.g. John Doe"
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
              <Text style={styles.label}>Email Address</Text>
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
              <Text style={styles.label}>Password (minimum 8 characters)</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  id="input-signup-password"
                  ref={passwordRef}
                  style={styles.passwordInput}
                  placeholder="At least 8 characters"
                  placeholderTextColor={Colors.textTertiary}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text)
                    if (error) setError('')
                  }}
                  secureTextEntry={!showPassword}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                />
                <TouchableOpacity
                  id="btn-toggle-signup-password"
                  style={styles.visibilityToggle}
                  onPress={() => setShowPassword(p => !p)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.visibilityToggleText}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  id="input-signup-confirm-password"
                  ref={confirmPasswordRef}
                  style={styles.passwordInput}
                  placeholder="Re-enter your password"
                  placeholderTextColor={Colors.textTertiary}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text)
                    if (error) setError('')
                  }}
                  secureTextEntry={!showConfirmPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleSignUp}
                />
                <TouchableOpacity
                  id="btn-toggle-signup-confirm-password"
                  style={styles.visibilityToggle}
                  onPress={() => setShowConfirmPassword(p => !p)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.visibilityToggleText}>
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Terms and Privacy Acknowledgement */}
            <TouchableOpacity
              id="chk-terms"
              style={styles.termsContainer}
              onPress={() => setAgreedToTerms(prev => !prev)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
                {agreedToTerms && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.termsText}>
                I acknowledge that reports I submit are public civic data, and I agree to the{' '}
                <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
                <Text style={styles.termsLink}>Privacy Policy</Text>.
              </Text>
            </TouchableOpacity>

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
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  visibilityToggle: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  visibilityToggleText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
  },

  // ── Terms checkbox ─────────────────────────────────────────────────────────
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  checkmark: {
    color: Colors.textInverse,
    fontSize: 14,
    fontWeight: Typography.fontWeight.bold,
  },
  termsText: {
    flex: 1,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  termsLink: {
    color: Colors.accent,
    fontWeight: Typography.fontWeight.medium,
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
    lineHeight: 20,
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
