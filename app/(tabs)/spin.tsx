import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useGameStore } from '@/store/useGameStore';
import { useAnomalyStore } from '@/store/useAnomalyStore';
import { useAuthStore } from '@/store/useAuthStore';
import { SpinButton } from '@/components/SpinButton';
import { ReelDisplay } from '@/components/ReelDisplay';
import { ResourceBar } from '@/components/ResourceBar';
import { RiftSelector } from '@/components/RiftSelector';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { TemporalRiftTier } from '@/services/SlotsEngine';

const EMPTY_REELS: ['EMPTY', 'EMPTY', 'EMPTY'] = ['EMPTY', 'EMPTY', 'EMPTY'];

export default function SpinScreen() {
  const {
    credits, attacks, raids, shields, spinsRemaining,
    isSpinning, lastResult, riftTier,
    spin, setRiftTier,
  } = useGameStore();

  const { definition } = useAnomalyStore();
  const { displayName } = useAuthStore();

  const reels = lastResult?.reels ?? EMPTY_REELS;
  const canSpin = spinsRemaining > 0 && !isSpinning;

  return (
    <SafeAreaView style={styles.root}>
      {displayName && (
        <Text style={styles.pilotBadge}>◎ {displayName}</Text>
      )}
      <ResourceBar
        credits={credits}
        attacks={attacks}
        raids={raids}
        shields={shields}
        spinsRemaining={spinsRemaining}
      />

      {/* Anomaly ticker */}
      {definition && definition.id !== 'CALM' && (
        <View style={[styles.anomalyTicker, { borderColor: definition.color }]}>
          <Text style={[styles.anomalyName, { color: definition.color }]}>
            {definition.name}
          </Text>
          <Text style={styles.anomalyDesc} numberOfLines={1}>
            {definition.description}
          </Text>
        </View>
      )}

      <View style={styles.content}>
        {/* Outcome banner */}
        <View style={styles.outcomeBanner}>
          {lastResult && lastResult.outcomeType !== 'NOTHING' ? (
            <Text style={styles.outcomeText}>{outcomeMessage(lastResult)}</Text>
          ) : (
            <Text style={styles.outcomeTextMuted}>
              {spinsRemaining > 0 ? 'Awaiting spin…' : 'No spins left'}
            </Text>
          )}
          {lastResult?.isJackpot && (
            <Text style={styles.jackpotBadge}>JACKPOT</Text>
          )}
        </View>

        <ReelDisplay reels={reels} isSpinning={isSpinning} />

        <View style={styles.spinZone}>
          <SpinButton onPress={spin} disabled={!canSpin} isSpinning={isSpinning} />
          <Text style={styles.spinsLabel}>{spinsRemaining} spins remaining</Text>
        </View>

        <RiftSelector
          currentTier={riftTier}
          availableCredits={credits}
          onSelect={(tier: TemporalRiftTier) => setRiftTier(tier)}
        />
      </View>
    </SafeAreaView>
  );
}

function outcomeMessage(result: NonNullable<ReturnType<typeof useGameStore.getState>['lastResult']>): string {
  switch (result.outcomeType) {
    case 'CREDITS': return `+${result.creditsWon.toLocaleString()} CREDITS`;
    case 'ATTACK': return `+${result.attacksWon} ATTACK${result.attacksWon !== 1 ? 'S' : ''}`;
    case 'RAID': return 'RAID READY';
    case 'SHIELD': return `+${result.shieldsWon} SHIELD${result.shieldsWon !== 1 ? 'S' : ''}`;
    default: return '';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  pilotBadge: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
    textAlign: 'right',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
  },
  anomalyTicker: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: Colors.surfaceElevated,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  anomalyName: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  anomalyDesc: {
    flex: 1,
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
  },
  content: { flex: 1, paddingTop: Spacing.lg, gap: Spacing.xl },
  outcomeBanner: {
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.md,
  },
  outcomeText: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
    letterSpacing: 3,
  },
  outcomeTextMuted: {
    fontSize: Typography.sizes.md,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  jackpotBadge: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.background,
    backgroundColor: Colors.credits,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    letterSpacing: 3,
    marginTop: Spacing.xs,
  },
  spinZone: { alignItems: 'center', gap: Spacing.sm },
  spinsLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
});
