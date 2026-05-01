import { useSharedValue, useAnimatedStyle, withSequence, withTiming, withSpring } from 'react-native-reanimated';

export function useShakeAnimation() {
  const shakeX = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  function shake() {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10,  { duration: 50 }),
      withTiming(-8,  { duration: 45 }),
      withTiming(8,   { duration: 45 }),
      withTiming(-5,  { duration: 40 }),
      withSpring(0,   { damping: 8, stiffness: 200 }),
    );
  }

  return { shakeStyle, shake };
}
