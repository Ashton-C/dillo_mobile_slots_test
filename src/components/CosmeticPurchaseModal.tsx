import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';
import { CosmeticItem } from '@/services/CosmeticsService';
import { CosmeticPreview } from '@/components/CosmeticPreview';
import { iapService } from '@/services/IapService';
import { useIapPrices } from '@/hooks/useIapPrices';
import { hapticBuildComplete } from '@/constants/haptics';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

interface Props {
  item: CosmeticItem | null;
  onDismiss: () => void;
  onResult?: (msg: string) => void;
}

// Shared confirm-and-buy modal. Used from any customize screen when the user
// taps a locked cosmetic. Handles both credit purchases and (simulated) IAP.
export function CosmeticPurchaseModal({ item, onDismiss, onResult }: Props) {
  const buyCosmetic   = useCosmeticsStore((s) => s.buy);
  const equipCosmetic = useCosmeticsStore((s) => s.equip);
  const livePrices    = useIapPrices(item ? [item.id] : []);

  async function confirm() {
    if (!item) return;
    if (item.creditCost > 0) {
      const result = buyCosmetic(item.id);
      if (result === 'ok') {
        equipCosmetic(item.id);
        hapticBuildComplete();
        onResult?.(`Unlocked & equipped: ${item.name}`);
      } else if (result === 'insufficient_credits') {
        onResult?.(`Need ${item.creditCost.toLocaleString()} CR — keep spinning!`);
      }
      onDismiss();
      return;
    }
    // IAP path — receipt validation + ownership grant happens server-side via
    // the RevenueCat webhook. Locally we optimistic-grant on success so the
    // tile flips to OWNED immediately; the webhook's arrayUnion is idempotent
    // so the eventual Firestore sync is a no-op.
    onDismiss();
    const r = await iapService.purchase(item.id);
    if (!r.ok) {
      if (r.error && r.error !== 'cancelled') onResult?.(`Purchase failed — ${r.error}`);
      return;
    }
    const next = new Set(useCosmeticsStore.getState().owned);
    next.add(item.id);
    useCosmeticsStore.setState({ owned: next });
    equipCosmetic(item.id);
    hapticBuildComplete();
    onResult?.(`Unlocked: ${item.name}`);
  }

  return (
    <Modal visible={!!item} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        {item && (
          <View style={styles.card}>
            <Text style={styles.title}>UNLOCK COSMETIC</Text>
            <View style={styles.previewWrap}>
              <CosmeticPreview category={item.category} itemId={item.id} accentColor={item.previewColor ?? Colors.primary} />
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
            </View>
            <Text style={styles.price}>
              {item.creditCost > 0
                ? `${item.creditCost.toLocaleString()} CR`
                : (livePrices[item.id] ?? item.iapPrice ?? '—')}
            </Text>
            {item.creditCost < 0 && (
              <Text style={styles.simulated}>RevenueCat · receipt validated server-side</Text>
            )}
            <View style={styles.actions}>
              <Pressable onPress={onDismiss} style={[styles.btn, styles.btnCancel]}>
                <Text style={styles.btnCancelText}>CANCEL</Text>
              </Pressable>
              <Pressable onPress={confirm} style={[styles.btn, styles.btnAccept]}>
                <Text style={styles.btnAcceptText}>{item.creditCost > 0 ? 'BUY' : 'UNLOCK'}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  title: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
    textAlign: 'center',
  },
  previewWrap: {
    alignItems: 'center',
    gap: 4,
  },
  itemName: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 6,
  },
  itemDesc: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  price: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.credits,
    letterSpacing: 2,
    textAlign: 'center',
  },
  simulated: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  btn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  btnCancel: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnCancelText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  btnAccept: {
    backgroundColor: Colors.primary,
    flex: 1.5,
  },
  btnAcceptText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.background,
    letterSpacing: 3,
  },
});
