import { Tabs } from 'expo-router';
import { StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEventStore } from '@/store/useEventStore';
import { ResourceBar } from '@/components/ResourceBar';
import { Colors, Typography } from '@/constants/theme';

function TabIcon({ label, focused, dot }: { label: string; focused: boolean; dot?: boolean }) {
  return (
    <View style={styles.iconContainer}>
      <Text
        style={[styles.iconLabel, focused && styles.iconLabelActive]}
        numberOfLines={1}
        allowFontScaling={false}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {label}
      </Text>
      {dot ? <View style={styles.notifyDot} /> : null}
    </View>
  );
}

function PilotTabIcon({ focused }: { focused: boolean }) {
  // Subscribe to events array so the dot updates as new events arrive.
  const events = useEventStore((s) => s.events);
  const pilotLastSeenAt = useEventStore((s) => s.pilotLastSeenAt);
  const hasUnread = events.some((e) => e.timestamp > pilotLastSeenAt);
  return <TabIcon label="PILOT" focused={focused} dot={hasUnread} />;
}

// Global resource header rendered on every tab via screenOptions.header.
// React Navigation calculates the header's safe-area inset itself, so the
// inner SafeAreaViews in each screen don't need to double-pad.
function GlobalResourceHeader() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
      <ResourceBar compact />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <GlobalResourceHeader />,
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
          tabBarIcon: ({ focused }) => <PilotTabIcon focused={focused} />,
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
  headerWrap: {
    backgroundColor: Colors.background,
  },
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
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  iconLabel: {
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
    textAlign: 'center',
    includeFontPadding: false,
  },
  iconLabelActive: {
    color: Colors.primary,
  },
  notifyDot: {
    position: 'absolute',
    top: 2,
    right: '24%',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
    borderWidth: 1,
    borderColor: Colors.surface,
  },
});
