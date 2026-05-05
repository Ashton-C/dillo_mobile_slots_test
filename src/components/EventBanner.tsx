import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  withTiming,
  withDelay,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useEventStore } from '@/store/useEventStore';
import { GameEvent } from '@/services/FirestoreService';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

function eventLabel(event: GameEvent): { title: string; body: string; color: string } {
  switch (event.type) {
    case 'ATTACK_INCOMING':
      return { title: '⚠ INTRUSION DETECTED', body: `${event.fromDisplayName} is breaching your perimeter`, color: Colors.danger };
    case 'RAID_INCOMING':
      return { title: '⚠ EXTRACTION BEAM', body: `${event.fromDisplayName} is siphoning your credits`, color: Colors.accent };
    case 'ATTACK_RESOLVED':
      return event.attackerWon
        ? { title: '⚔ BREACH SUCCEEDED', body: `Lost ${event.creditsLost ?? 0} CR to ${event.fromDisplayName}`, color: Colors.danger }
        : { title: '◉ BREACH REPELLED', body: `${event.fromDisplayName}'s intrusion was blocked`, color: Colors.shield };
    case 'RAID_RESOLVED':
      return event.attackerWon
        ? { title: '⛏ EXTRACTION COMPLETE', body: `${event.fromDisplayName} siphoned ${event.creditsLost ?? 0} CR`, color: Colors.accent }
        : { title: '◉ EXTRACTION BLOCKED', body: `VAULT held — no credits lost`, color: Colors.shield };
    case 'COMBAT_RESULT':
      return event.attackerWon
        ? { title: '⚔ RAID SUCCESSFUL', body: `Seized ${event.creditsGained ?? 0} CR from ${event.fromDisplayName}`, color: Colors.success }
        : { title: '✗ RAID FAILED', body: `${event.fromDisplayName} repelled the attack`, color: Colors.textMuted };
    default:
      return { title: 'SIGNAL', body: 'Incoming transmission', color: Colors.primary };
  }
}

const BANNER_HEIGHT = 72;
const AUTO_DISMISS_MS = 5000;

export function EventBanner() {
  const { activeEvent, dismissActive } = useEventStore();
  const translateY = useSharedValue(-BANNER_HEIGHT - 16);

  useEffect(() => {
    if (activeEvent) {
      translateY.value = withTiming(0, { duration: 320 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

      const timer = setTimeout(() => {
        translateY.value = withTiming(-BANNER_HEIGHT - 16, { duration: 260 }, (done) => {
          if (done) runOnJS(dismissActive)();
        });
      }, AUTO_DISMISS_MS);

      return () => clearTimeout(timer);
    } else {
      translateY.value = withTiming(-BANNER_HEIGHT - 16, { duration: 260 });
    }
  }, [activeEvent?.id]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!activeEvent) return null;

  const { title, body, color } = eventLabel(activeEvent);

  function handleDismiss() {
    translateY.value = withTiming(-BANNER_HEIGHT - 16, { duration: 260 }, (done) => {
      if (done) runOnJS(dismissActive)();
    });
  }

  return (
    <Animated.View style={[styles.banner, animStyle]}>
      <View style={[styles.colorBar, { backgroundColor: color }]} />
      <View style={styles.content}>
        <Text style={[styles.title, { color }]}>{title}</Text>
        <Text style={styles.body} numberOfLines={1}>{body}</Text>
      </View>
      <Pressable onPress={handleDismiss} style={styles.dismiss}>
        <Text style={styles.dismissText}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 52,
    left: Spacing.md,
    right: Spacing.md,
    height: BANNER_HEIGHT,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    zIndex: 999,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  colorBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    gap: 2,
  },
  title: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  body: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
  },
  dismiss: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  dismissText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
});
