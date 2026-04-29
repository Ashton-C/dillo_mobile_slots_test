import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { SlotSymbol } from '@/services/SlotsEngine';
import { Colors, BorderRadius, Typography } from '@/constants/theme';

const SYMBOL_GLYPHS: Record<SlotSymbol, string> = {
  CREDIT_SMALL:  '◈',
  CREDIT_MEDIUM: '◈◈',
  CREDIT_LARGE:  '◈◈◈',
  ATTACK:        '⚡',
  RAID:          '▲▲',
  SHIELD:        '◉',
  INTRUSION:     '⚔',
  EXTRACTION:    '⛏',
  EMPTY:         '·',
};

const SYMBOL_COLORS: Record<SlotSymbol, string> = {
  CREDIT_SMALL:  Colors.credits,
  CREDIT_MEDIUM: Colors.credits,
  CREDIT_LARGE:  Colors.credits,
  ATTACK:        Colors.attack,
  RAID:          Colors.raid,
  SHIELD:        Colors.shield,
  INTRUSION:     Colors.danger,
  EXTRACTION:    Colors.accent,
  EMPTY:         Colors.textMuted,
};

interface ReelProps {
  symbol: SlotSymbol;
  isSpinning: boolean;
  delayMs?: number;
}

function Reel({ symbol, isSpinning, delayMs = 0 }: ReelProps) {
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (isSpinning) {
      opacity.value = 0.4;
      translateY.value = withDelay(
        delayMs,
        withRepeat(
          withTiming(-8, { duration: 120, easing: Easing.linear }),
          -1,
          true,
        ),
      );
    } else {
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 150 });
    }
  }, [isSpinning]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <View style={styles.reelCell}>
      <Animated.View style={animatedStyle}>
        <Text style={[styles.symbol, { color: SYMBOL_COLORS[symbol] }]}>
          {SYMBOL_GLYPHS[symbol]}
        </Text>
      </Animated.View>
    </View>
  );
}

interface Props {
  reels: [SlotSymbol, SlotSymbol, SlotSymbol];
  isSpinning: boolean;
}

export function ReelDisplay({ reels, isSpinning }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <Reel symbol={reels[0]} isSpinning={isSpinning} delayMs={0} />
        <View style={styles.divider} />
        <Reel symbol={reels[1]} isSpinning={isSpinning} delayMs={80} />
        <View style={styles.divider} />
        <Reel symbol={reels[2]} isSpinning={isSpinning} delayMs={160} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  track: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    width: '100%',
  },
  reelCell: {
    flex: 1,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
  },
  symbol: {
    fontSize: Typography.sizes.hero,
    lineHeight: 56,
  },
  divider: {
    width: 1,
    backgroundColor: Colors.border,
  },
});
