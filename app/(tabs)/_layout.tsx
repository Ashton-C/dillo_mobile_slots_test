import { Tabs } from 'expo-router';
import { StyleSheet, View, Text } from 'react-native';
import { Colors, Typography } from '@/constants/theme';

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={styles.iconContainer}>
      <Text style={[styles.iconLabel, focused && styles.iconLabelActive]}>
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="spin"
        options={{
          title: 'Spin',
          tabBarIcon: ({ focused }) => <TabIcon label="SPIN" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="habitat"
        options={{
          title: 'Habitat',
          tabBarIcon: ({ focused }) => <TabIcon label="BASE" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="hangar"
        options={{
          title: 'The Wire',
          tabBarIcon: ({ focused }) => <TabIcon label="WIRE" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="rift"
        options={{
          title: 'Rift',
          tabBarIcon: ({ focused }) => <TabIcon label="RIFT" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="pilot"
        options={{
          title: 'Pilot',
          tabBarIcon: ({ focused }) => <TabIcon label="PILOT" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="store"
        options={{
          title: 'Store',
          tabBarIcon: ({ focused }) => <TabIcon label="STORE" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="dev"
        options={{
          title: 'Dev',
          tabBarButton: __DEV__ ? undefined : () => null,
          tabBarIcon: ({ focused }) => <TabIcon label="DEV" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 60,
    paddingBottom: 8,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  iconLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
    color: Colors.textMuted,
  },
  iconLabelActive: {
    color: Colors.primary,
  },
});
