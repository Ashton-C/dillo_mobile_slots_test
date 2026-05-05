import { useEffect } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  accentColor?: string;
  children: React.ReactNode;
}

export function LegendCard({ visible, onDismiss, title, accentColor = Colors.primary, children }: Props) {
  const translateY = useSharedValue(-400);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
    }
  }, [visible]);

  function handleDismiss() {
    translateY.value = withTiming(-400, { duration: 200 }, (finished) => {
      if (finished) runOnJS(onDismiss)();
    });
  }

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={handleDismiss}>
      <Pressable style={styles.backdrop} onPress={handleDismiss} />
      <Animated.View style={[styles.container, animStyle]}>
        <Pressable onPress={() => {}} style={styles.card}>
          <View style={[styles.titleRow, { borderBottomColor: accentColor + '44' }]}>
            <Text style={[styles.title, { color: accentColor }]}>{title}</Text>
            <Pressable onPress={handleDismiss} style={styles.closeButton} hitSlop={12}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          <Pressable onPress={handleDismiss} style={styles.dismissRow}>
            <Text style={styles.dismissText}>CLOSE  ↑</Text>
          </Pressable>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

// ── Shared content helpers ────────────────────────────────────────────────────

export function LegendSection({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

export function LegendRow({ left, right, color }: { left: string; right?: string; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLeft, color ? { color } : null]}>{left}</Text>
      {right ? <Text style={styles.rowRight}>{right}</Text> : null}
    </View>
  );
}

export function LegendNote({ text }: { text: string }) {
  return <Text style={styles.note}>{text}</Text>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  card: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
    maxHeight: 480,
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 4,
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: 4,
  },
  sectionLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
    letterSpacing: 3,
    marginTop: Spacing.sm,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  rowLeft: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    flex: 1,
    letterSpacing: 0.5,
  },
  rowRight: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    textAlign: 'right',
  },
  note: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    lineHeight: 17,
    marginTop: Spacing.sm,
  },
  dismissRow: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  dismissText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
});
