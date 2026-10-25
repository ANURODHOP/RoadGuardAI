import { Tabs } from 'expo-router'
import { Text, Platform } from 'react-native'
import { Colors } from '../../src/lib/theme'

// Simple emoji icon component
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontSize: 22,
        opacity: focused ? 1 : 0.55,
        // Slight scale emphasis on active
        transform: [{ scale: focused ? 1.1 : 1 }],
      }}
    >
      {emoji}
    </Text>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: Colors.accent,       // #2D7D46
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: Colors.background,       // #FFFFFF
          borderTopWidth: 1,
          borderTopColor: Colors.border,            // #E5E8EC
          paddingBottom: Platform.OS === 'ios' ? 0 : 8,
          paddingTop: 6,
          height: Platform.OS === 'ios' ? 82 : 62,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🏠" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🗺️" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'My Reports',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📋" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="👤" focused={focused} />
          ),
        }}
      />
    </Tabs>
  )
}
