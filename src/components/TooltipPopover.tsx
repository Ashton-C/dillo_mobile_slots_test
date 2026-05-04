import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

interface Props {
  label: string;
  visible: boolean;
  onDismiss: () => void;
  bottom?: number;
}

export function TooltipPopover({ label, visible, onDismiss, bottom = 140 }: Props) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(6);

  useEffect(() => {
    opacity.value    = withTiming(visible ? 1 : 0, { duration: 150 });
    translateY.value = withTiming(visible ? 0 : 6, { duration: 150 });
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      <Animated.View
        style={[styles.box, { bottom }, animStyle]}
        pointerEvents="none"
      >
        <Text style={styles.text}>{label}</Text>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    zIndex: 201,
  },
  text: {
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    lineHeight: 16,
    textAlign: 'center',
  },
});
