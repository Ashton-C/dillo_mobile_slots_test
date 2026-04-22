import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Typography, BorderRadius } from '@/constants/theme';

interface Props {
  onPress: () => void;
  disabled?: boolean;
  isSpinning?: boolean;
}

export function SpinButton({ onPress, disabled, isSpinning }: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePress() {
    scale.value = withSequence(
      withTiming(0.93, { duration: 80 }),
      withTiming(1, { duration: 120 }),
    );
    onPress();
  }

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        disabled={disabled || isSpinning}
        style={[styles.button, (disabled || isSpinning) && styles.buttonDisabled]}
      >
        {isSpinning ? (
          <ActivityIndicator color={Colors.textPrimary} size="small" />
        ) : (
          <Text style={styles.label}>SPIN</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
