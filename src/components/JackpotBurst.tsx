import { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Typography } from '@/constants/theme';

const NUM = 12;
const ANGLES = Array.from({ length: NUM }, (_, i) => (i * (360 / NUM) * Math.PI) / 180);

interface ParticleProps {
  angle: number;
  progress: Animated.SharedValue<number>;
  opacity: Animated.SharedValue<number>;
  color: string;
  size: number;
  maxDist: number;
}

function Particle({ angle, progress, opacity, color, size, maxDist }: ParticleProps) {
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: Math.cos(angle) * maxDist * progress.value },
      { translateY: Math.sin(angle) * maxDist * progress.value },
    ],
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
    />
  );
}

interface Props {
  visible: boolean;
  creditsWon?: number;
}

export function JackpotBurst({ visible, creditsWon = 0 }: Props) {
  // Three rings — each gets its own progress + opacity
  const p0 = useSharedValue(0); const op0 = useSharedValue(0);
  const p1 = useSharedValue(0); const op1 = useSharedValue(0);
  const p2 = useSharedValue(0); const op2 = useSharedValue(0);

  // Floating credit label
  const labelY = useSharedValue(0);
  const labelScale = useSharedValue(0);
  const labelOpacity = useSharedValue(0);

  const ease = Easing.out(Easing.quad);

  function fireRing(p: Animated.SharedValue<number>, op: Animated.SharedValue<number>, delay: number) {
    p.value = 0;
    op.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration: 700, easing: ease }));
    op.value = withDelay(delay, withSequence(
      withTiming(1, { duration: 40 }),
      withDelay(300, withTiming(0, { duration: 380 })),
    ));
  }

  useEffect(() => {
    if (visible) {
      fireRing(p0, op0, 0);
      fireRing(p1, op1, 120);
      fireRing(p2, op2, 240);

      labelY.value = 0;
      labelScale.value = 0;
      labelOpacity.value = 0;
      labelScale.value = withSequence(
        withTiming(1.6, { duration: 180, easing: Easing.out(Easing.back(1.5)) }),
        withDelay(300, withTiming(0, { duration: 300 })),
      );
      labelY.value = withTiming(-90, { duration: 780, easing: ease });
      labelOpacity.value = withSequence(
        withTiming(1, { duration: 120 }),
        withDelay(380, withTiming(0, { duration: 300 })),
      );
    } else {
      [p0, p1, p2, op0, op1, op2].forEach((v) => (v.value = 0));
      labelOpacity.value = 0;
      labelScale.value = 0;
    }
  }, [visible]);

  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    transform: [{ translateY: labelY.value }, { scale: labelScale.value }],
  }));

  if (!visible) return null;

  return (
    <View style={styles.burst} pointerEvents="none">
      {/* Inner ring — gold */}
      {ANGLES.map((angle, i) => (
        <Particle key={`r0-${i}`} angle={angle} progress={p0} opacity={op0}
          color={Colors.credits} size={i % 3 === 0 ? 8 : 5} maxDist={90} />
      ))}
      {/* Mid ring — orange */}
      {ANGLES.map((angle, i) => (
        <Particle key={`r1-${i}`} angle={angle} progress={p1} opacity={op1}
          color={Colors.primary} size={i % 3 === 0 ? 7 : 4} maxDist={145} />
      ))}
      {/* Outer ring — purple */}
      {ANGLES.map((angle, i) => (
        <Particle key={`r2-${i}`} angle={angle} progress={p2} opacity={op2}
          color={Colors.accent} size={i % 3 === 0 ? 6 : 3} maxDist={205} />
      ))}

      {/* Floating credit amount */}
      {creditsWon > 0 && (
        <Animated.View style={[styles.labelWrap, labelStyle]}>
          <Text style={styles.labelText}>+{creditsWon.toLocaleString()}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  burst: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 90,
  },
  labelWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  labelText: {
    fontSize: Typography.sizes.hero,
    fontWeight: Typography.weights.bold,
    color: Colors.credits,
    letterSpacing: 2,
    textShadowColor: Colors.credits + '88',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
});
