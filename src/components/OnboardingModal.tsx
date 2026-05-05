import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const STORAGE_KEY = 'onboarding_v1';

const STEPS = [
  {
    icon: '◈',
    iconColor: Colors.primary,
    title: 'WELCOME, PILOT',
    body: 'You run a frontier homestead at the edge of civilized space. Credits keep the lights on — and credits come from spinning.\n\nHit SPIN on the main screen to draw from the reel.',
    cta: 'SHOW ME',
  },
  {
    icon: '⬡',
    iconColor: Colors.accent,
    title: 'BUILD YOUR HOMESTEAD',
    body: 'Credits fund your base. Head to the BASE tab to construct buildings.\n\nGENERATOR boosts your credit haul. ARMORY stockpiles fuel for attacks. HANGAR unlocks crew contracts.',
    cta: 'GOT IT',
  },
  {
    icon: '◉',
    iconColor: Colors.info,
    title: 'HIRE YOUR CREW',
    body: 'Once your HANGAR is built, open CONTRACTS to hire hands. They stack passive bonuses on every spin — credit multipliers, raid boosts, and defense buffs.\n\nThe reel is just the beginning.',
    cta: "LET'S GO",
  },
] as const;

interface Props {
  onDone: () => void;
}

export function OnboardingModal({ onDone }: Props) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  const opacity = useSharedValue(0);
  const slideY = useSharedValue(30);
  const contentOpacity = useSharedValue(1);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (!val) {
        setVisible(true);
        opacity.value = withTiming(1, { duration: 400 });
        slideY.value = withSpring(0, { damping: 18, stiffness: 120 });
      }
    });
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: slideY.value }],
  }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  function advance() {
    if (step < STEPS.length - 1) {
      contentOpacity.value = withTiming(0, { duration: 120 }, () => {
        runOnJS(setStep)(step + 1);
        contentOpacity.value = withTiming(1, { duration: 180 });
      });
    } else {
      dismiss();
    }
  }

  function dismiss() {
    opacity.value = withTiming(0, { duration: 300 }, () => {
      runOnJS(setVisible)(false);
      runOnJS(onDone)();
    });
    AsyncStorage.setItem(STORAGE_KEY, 'done');
  }

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <Modal transparent visible={visible} statusBarTranslucent animationType="none">
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Animated.View style={[styles.content, contentStyle]}>
            {/* Step dots */}
            <View style={styles.dots}>
              {STEPS.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === step && { backgroundColor: Colors.primary, width: 18 }]}
                />
              ))}
            </View>

            {/* Icon */}
            <Text style={[styles.icon, { color: current.iconColor }]}>{current.icon}</Text>

            {/* Title */}
            <Text style={styles.title}>{current.title}</Text>

            {/* Body */}
            <Text style={styles.body}>{current.body}</Text>

            {/* CTA */}
            <Pressable onPress={advance} style={styles.cta}>
              <Text style={styles.ctaText}>{current.cta}</Text>
            </Pressable>

            {/* Skip */}
            {step < STEPS.length - 1 && (
              <Pressable onPress={dismiss} hitSlop={12}>
                <Text style={styles.skip}>SKIP</Text>
              </Pressable>
            )}
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 48,
    paddingHorizontal: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  content: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  icon: {
    fontSize: 48,
    marginTop: Spacing.sm,
  },
  title: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 4,
    textAlign: 'center',
  },
  body: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  cta: {
    width: '100%',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  ctaText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 4,
  },
  skip: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
});
