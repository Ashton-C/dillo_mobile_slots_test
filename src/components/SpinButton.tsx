import { useEffect } from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BUTTON_SKIN_TOKENS } from '@/services/CosmeticsService';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';
import { soundService } from '@/services/SoundService';
import { Colors, Typography, BorderRadius } from '@/constants/theme';

interface Props {
  onPress: () => void;
  disabled?: boolean;
  isSpinning?: boolean;
}

export function SpinButton({ onPress, disabled, isSpinning }: Props) {
  const activeSkinId = useCosmeticsStore((s) => s.active['SPIN_BUTTON'] ?? 'btn_default');
  const skin = BUTTON_SKIN_TOKENS[activeSkinId] ?? BUTTON_SKIN_TOKENS.btn_default;

  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);

  useEffect(() => {
    if (!disabled && !isSpinning) {
      pulseOpacity.value = withTiming(0.35, { duration: 300 });
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.22, { duration: 1400, easing: Easing.out(Easing.ease) }),
          withTiming(1.0, { duration: 1400, easing: Easing.in(Easing.ease) }),
        ),
        -1,
      );
    } else {
      pulseOpacity.value = withTiming(0, { duration: 200 });
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [disabled, isSpinning]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    void soundService.play('spinStart');
    scale.value = withSequence(
      withTiming(0.86, { duration: 55 }),
      withSpring(1.04, { damping: 5, stiffness: 300 }),
      withSpring(1, { damping: 8, stiffness: 200 }),
    );
    onPress();
  }

  return (
    <View style={styles.wrapper}>
      {/* Pulsing glow ring */}
      <Animated.View style={[styles.glowRing, { backgroundColor: skin.glowColor + '55' }, pulseStyle]} />
      {/* Button */}
      <Animated.View style={[styles.buttonContainer, buttonStyle]}>
        <Pressable
          onPress={handlePress}
          disabled={disabled || isSpinning}
          style={[styles.button, { backgroundColor: skin.color, shadowColor: skin.glowColor }, (disabled || isSpinning) && { backgroundColor: skin.dimColor }]}
        >
          {isSpinning ? (
            <ActivityIndicator color={Colors.textPrimary} size="small" />
          ) : (
            <Text style={styles.label}>SPIN</Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '55',
  },
  buttonContainer: {
    position: 'absolute',
  },
  button: {
    width: 140,
    height: 140,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  buttonDisabled: {
    backgroundColor: Colors.primaryDim,
    shadowOpacity: 0.2,
  },
  label: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 4,
  },
});
