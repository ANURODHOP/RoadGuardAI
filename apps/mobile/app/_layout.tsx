import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { supabase } from '../src/lib/supabase'
import { useRouter, useSegments } from 'expo-router'
import { useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Colors } from '../src/lib/theme'
import type { Session } from '@supabase/supabase-js'

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (loading) return

    const inAuthGroup = segments[0] === '(auth)'
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/welcome')
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/')
    }
  }, [session, segments, loading])

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    )
  }

  return <>{children}</>
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" backgroundColor={Colors.background} />
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="capture" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          <Stack.Screen name="detection" options={{ presentation: 'card', headerShown: false }} />
          <Stack.Screen name="duplicate-check" options={{ presentation: 'card', headerShown: false }} />
          <Stack.Screen name="submit-complaint" options={{ presentation: 'card', headerShown: false }} />
          <Stack.Screen name="complaint/[id]" options={{ presentation: 'card', headerShown: false }} />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  )
}
