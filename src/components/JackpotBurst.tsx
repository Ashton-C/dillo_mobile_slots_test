import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '@/constants/theme';

const NUM_PARTICLES = 12;
const MAX_DIST = 115;
const ANGLES = Array.from(
  { length: NUM_PARTICLES },
  (_, i) => (i * (360 / NUM_PARTICLES) * Math.PI) / 180,
);

interface ParticleProps {
  angle: number;
  progress: Animated.SharedValue<number>;
  opacity: Animated.SharedValue<number>;
  color: string;
  size: number;
}

function Particle({ angle, progress, opacity, color, size }: ParticleProps) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: cos * MAX_DIST * progress.value },
      { translateY: sin * MAX_DIST * progress.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

interface Props {
  visible: boolean;
}

export function JackpotBurst({ visible }: Props) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      progress.value = 0;
      opacity.value = 1;
      progress.value = withTiming(1, {
        duration: 700,
        easing: Easing.out(Easing.quad),
      });
      opacity.value = withSequence(
        withTiming(1, { duration: 50 }),
        withDelay(350, withTiming(0, { duration: 400 })),
      );
    } else {
      progress.value = 0;
      opacity.value = 0;
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.burst} pointerEvents="none">
      {ANGLES.map((angle, i) => (
        <Particle
          key={i}
          angle={angle}
          progress={progress}
          opacity={opacity}
          color={i % 2 === 0 ? Colors.credits : Colors.primary}
          size={i % 3 === 0 ? 8 : 5}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  burst: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
