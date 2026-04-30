import { useEffect, useRef, useState } from 'react';
import { TextStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '@/constants/theme';

interface Props {
  value: number;
  color: string;
  style?: TextStyle;
}

export function CreditCounter({ value, color, style }: Props) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);
  const flashT = useSharedValue(0);
  const flashDir = useSharedValue(1); // 1 = gain, -1 = loss

  const animStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      flashT.value,
      [0, 1],
      [color, flashDir.value > 0 ? Colors.success : Colors.danger],
    ),
  }));

  useEffect(() => {
    const from = prevRef.current;
    if (from === value) return;
    prevRef.current = value;

    flashDir.value = value > from ? 1 : -1;
    flashT.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(0, { duration: 500 }),
    );

    const STEPS = 18;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const t = step / STEPS;
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(from + (value - from) * eased));
      if (step >= STEPS) {
        clearInterval(id);
        setDisplayed(value);
      }
    }, 33);

    return () => clearInterval(id);
  }, [value]);

  return (
    <Animated.Text style={[style, animStyle]}>
      {displayed.toLocaleString()}
    </Animated.Text>
  );
}
