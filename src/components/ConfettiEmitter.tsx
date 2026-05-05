import { useEffect } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Colors } from '@/constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const PARTICLE_COLORS = [
  Colors.primary,
  Colors.accent,
  Colors.credits,
  Colors.info,
  Colors.success,
  Colors.danger,
  '#FF44CC',
  '#44FFDD',
];

const PARTICLE_COUNT = 40;

interface Particle {
  x: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  rotateEnd: number;
  driftX: number;
}

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    x: (Math.random() * SCREEN_W * 0.9) + SCREEN_W * 0.05,
    size: 6 + Math.random() * 8,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    delay: Math.random() * 600,
    duration: 1200 + Math.random() * 800,
    rotateEnd: (Math.random() - 0.5) * 720,
    driftX: (Math.random() - 0.5) * 80,
  }));
}

const PARTICLES = makeParticles();

function ConfettiPiece({ particle }: { particle: Particle }) {
  const y = useSharedValue(-20);
  const x = useSharedValue(particle.x);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    y.value = withDelay(particle.delay,
      withTiming(SCREEN_H * 0.85, { duration: particle.duration, easing: Easing.in(Easing.quad) })
    );
    x.value = withDelay(particle.delay,
      withTiming(particle.x + particle.driftX, { duration: particle.duration })
    );
    rotate.value = withDelay(particle.delay,
      withTiming(particle.rotateEnd, { duration: particle.duration })
    );
    opacity.value = withDelay(particle.delay + particle.duration * 0.6,
      withTiming(0, { duration: particle.duration * 0.4 })
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        style,
        { width: particle.size, height: particle.size * 0.6, backgroundColor: particle.color },
      ]}
    />
  );
}

interface Props {
  active: boolean;
}

export function ConfettiEmitter({ active }: Props) {
  if (!active) return null;
  return (
    <>
      {PARTICLES.map((p, i) => (
        <ConfettiPiece key={i} particle={p} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 2,
  },
});
