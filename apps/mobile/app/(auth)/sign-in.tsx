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

export default function SignInScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (authError) {
        // Helpful error mapping
        if (authError.message.includes('Invalid login credentials')) {
          setError('Incorrect email or password. Please try again.')
        } else if (authError.message.includes('Email not confirmed')) {
          setError('Your email is not verified yet. Please check your inbox for the activation link.')
        } else if (authError.message.toLowerCase().includes('network') || authError.message.toLowerCase().includes('fetch')) {
          setError('Network connection failed. Please check your internet connection.')
        } else {
          setError(authError.message)
        }
      }
      // On success, RootLayout's AuthProvider detects the session and navigates to (tabs)
    } catch (err: any) {
      setError(err?.message ?? 'An unexpected error occurred during sign in.')
    } finally {
      setLoading(false)
    }
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
          {/* Header */}
          <TouchableOpacity
            id="btn-back-from-signin"
            style={styles.backButton}
            onPress={() => router.replace('/(auth)/welcome')}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to track your road damage reports</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email address</Text>
              <TextInput
                id="input-email"
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
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.passwordLabelRow}>
                <Text style={styles.label}>Password</Text>
                <TouchableOpacity
                  id="btn-forgot-password"
                  onPress={() => router.push('/(auth)/forgot-password')}
                >
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  id="input-password"
                  style={styles.passwordInput}
                  placeholder="Your password"
                  placeholderTextColor={Colors.textTertiary}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t)
                    if (error) setError('')
                  }}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleSignIn}
                />
                <TouchableOpacity
                  id="btn-toggle-password-visibility"
                  style={styles.visibilityToggle}
                  onPress={() => setShowPassword(prev => !prev)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.visibilityToggleText}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {!!error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              id="btn-signin-submit"
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleSignIn}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.primaryButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity
              id="btn-goto-signup"
              onPress={() => router.push('/(auth)/sign-up')}
            >
              <Text style={styles.linkText}>Create one</Text>
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
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotPasswordText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.accent,
    fontWeight: Typography.fontWeight.medium,
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
})
