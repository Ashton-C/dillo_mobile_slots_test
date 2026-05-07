import { Tabs } from 'expo-router';
import { StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography } from '@/constants/theme';

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={styles.iconContainer}>
      <Text
        style={[styles.iconLabel, focused && styles.iconLabelActive]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          { height: 68 + insets.bottom, paddingBottom: 8 + insets.bottom },
        ],
        tabBarItemStyle: styles.tabBarItem,
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
          href: null,
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
  },
  tabBarItem: {
    paddingHorizontal: 0,
  },
  iconContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  iconLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
    color: Colors.textMuted,
  },
  iconLabelActive: {
    color: Colors.primary,
  },
});
