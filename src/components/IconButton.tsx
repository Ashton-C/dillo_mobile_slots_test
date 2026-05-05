import { Pressable, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, Typography } from '@/constants/theme';

export const ICON_BUTTON_SIZE = 32;

interface Props {
  glyph: string;
  onPress: () => void;
  active?: boolean;
  activeColor?: string;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  glyph,
  onPress,
  active = false,
  activeColor,
  hitSlop = 12,
  style,
}: Props) {
  const tint = active ? (activeColor ?? Colors.accent) : Colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      style={[styles.btn, active && { borderColor: tint }, style]}
    >
      <Text style={[styles.glyph, { color: tint }]}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: ICON_BUTTON_SIZE,
    height: ICON_BUTTON_SIZE,
    borderRadius: ICON_BUTTON_SIZE / 2,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
});
