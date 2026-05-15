import { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  writeCombatRequest,
  subscribeToCombatRequest,
  PlayerIndexEntry,
  CombatRequestResolution,
} from '@/services/FirestoreService';
import { CombatResolutionChip } from '@/components/CombatResolutionChip';
import { auth } from '@/lib/firebase';
import { useGameStore } from '@/store/useGameStore';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

type Phase = 'DEAL' | 'PLAYER' | 'DEALER' | 'DONE';

const BJ_RULES_KEY = '@bj_rules_seen';

interface Props {
  visible: boolean;
  target: PlayerIndexEntry | null;
  combatType: 'INTRUSION' | 'EXTRACTION';
  // Optional pre-raid card id. Validated + applied server-side in
  // resolveCombat; the client only passes it through.
  cardId?: string | null;
  onClose: () => void;
  onResult: (won: boolean) => void;
}

// ─── Cards ───────────────────────────────────────────────────────────────────

type Suit = '♠' | '♥' | '♦' | '♣';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
interface Card { rank: Rank; suit: Suit }

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

function buildShuffledDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function rankValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return parseInt(rank, 10);
}

// Best hand value treating Aces as 11 unless that busts; downgrade as needed.
function handValue(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += rankValue(c.rank);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards) === 21;
}

// ─── Power mapping ───────────────────────────────────────────────────────────
//
// Mirrors the LOOT_TIER thresholds in functions/src/index.ts. Tier 1 (90) maps
// to 5%-of-wallet, tier 2 (110) → 8%, tier 3 (130/145) → 12%. The Cloud
// Function's VALID_POWERS set must include every value we can return here.
function blackjackPower(playerCards: Card[], dealerCards: Card[]): { power: 8 | 90 | 110 | 130 | 145; outcome: string } {
  const p = handValue(playerCards);
  const d = handValue(dealerCards);
  const pBJ = isBlackjack(playerCards);
  const dBJ = isBlackjack(dealerCards);

  if (pBJ && !dBJ)         return { power: 145, outcome: 'BLACKJACK' };
  if (p > 21)              return { power: 8,   outcome: 'BUST' };
  if (d <= 21 && p <= d)   return { power: 8,   outcome: p === d ? 'PUSH' : 'DEALER WINS' };
  // Player wins (dealer busted, or player > dealer)
  if (p === 21)            return { power: 130, outcome: 'TWENTY-ONE' };
  if (p === 20)            return { power: 110, outcome: 'TWENTY' };
  return { power: 90, outcome: `WIN ${p}` };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BlackjackMiniGame({ visible, target, combatType, cardId, onClose, onResult }: Props) {
  const [phase, setPhase] = useState<Phase>('DEAL');
  const [deck, setDeck] = useState<Card[]>([]);
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [outcome, setOutcome] = useState<string>('');
  const [won, setWon] = useState(false);
  const [resolution, setResolution] = useState<CombatRequestResolution | null>(null);
  const [sentPower, setSentPower] = useState(8);
  const [showRulesHint, setShowRulesHint] = useState(false);
  const requestUnsubRef = useRef<(() => void) | null>(null);

  // Show the rules hint exactly once per install on the first time the
  // mini-game is opened.
  useEffect(() => {
    AsyncStorage.getItem(BJ_RULES_KEY).then((seen) => {
      if (!seen) setShowRulesHint(true);
    });
  }, []);

  function dismissRulesHint() {
    setShowRulesHint(false);
    AsyncStorage.setItem(BJ_RULES_KEY, '1').catch(console.error);
  }

  useEffect(() => {
    if (!visible) {
      requestUnsubRef.current?.();
      requestUnsubRef.current = null;
      return;
    }
    const d = buildShuffledDeck();
    const pHand = [d.pop()!, d.pop()!];
    const dHand = [d.pop()!, d.pop()!];
    setDeck(d);
    setPlayer(pHand);
    setDealer(dHand);
    setPhase('PLAYER');
    setOutcome('');
    setWon(false);
    setResolution(null);
    setSentPower(8);

    // Auto-resolve a natural blackjack on the deal.
    if (isBlackjack(pHand) || isBlackjack(dHand)) {
      setTimeout(() => resolve(pHand, dHand), 500);
    }
  }, [visible]);

  useEffect(() => () => {
    requestUnsubRef.current?.();
  }, []);

  function hit() {
    if (phase !== 'PLAYER') return;
    Haptics.selectionAsync().catch(() => {});
    const next = [...deck];
    const card = next.pop()!;
    const newPlayer = [...player, card];
    setDeck(next);
    setPlayer(newPlayer);
    if (handValue(newPlayer) >= 21) {
      // Auto-stand on 21, auto-resolve on bust.
      setTimeout(() => stand(newPlayer, next), 350);
    }
  }

  function stand(currentPlayer: Card[] = player, currentDeck: Card[] = deck) {
    if (phase !== 'PLAYER') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPhase('DEALER');

    // Dealer plays out: hit while ≤16, stand on ≥17 (incl. soft).
    const d = [...currentDeck];
    const newDealer = [...dealer];
    while (handValue(newDealer) < 17 && d.length > 0) {
      newDealer.push(d.pop()!);
    }
    setDealer(newDealer);
    setDeck(d);
    setTimeout(() => resolve(currentPlayer, newDealer), 600);
  }

  function resolve(p: Card[], d: Card[]) {
    const { power, outcome: outcomeText } = blackjackPower(p, d);
    const didWin = power > 8;
    setSentPower(power);

    // Stardust skill drip: every blackjack-extraction win earns +1 ✦.
    // Local-only — the server doesn't need to authority this since it's
    // not paid-content. Mirrors the jackpot drip in useGameStore.spin().
    if (didWin) useGameStore.getState().addStardust(1);

    const uid = auth.currentUser?.uid;
    if (uid && target) {
      writeCombatRequest({
        attackerUid: uid,
        defenderUid: target.uid,
        type: combatType,
        attackerPower: power,
        cardId: cardId ?? undefined,
        sectorMatch: true,
      }).then((requestId) => {
        requestUnsubRef.current?.();
        requestUnsubRef.current = subscribeToCombatRequest(requestId, (r) => {
          setResolution(r);
          if (r.status === 'RESOLVED') {
            requestUnsubRef.current?.();
            requestUnsubRef.current = null;
          }
        });
      }).catch(console.error);
    }

    Haptics.notificationAsync(
      didWin ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});

    setOutcome(outcomeText);
    setWon(didWin);
    setPhase('DONE');
    onResult(didWin);
  }

  const accentColor = combatType === 'EXTRACTION' ? Colors.accent : Colors.danger;
  const playerTotal = handValue(player);
  const dealerTotal = handValue(dealer);
  const dealerVisibleTotal = phase === 'PLAYER' ? rankValue(dealer[0]?.rank ?? '2') : dealerTotal;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.panel}>

          <LinearGradient colors={[accentColor + '33', 'transparent']} style={styles.headerGrad}>
            <Text style={[styles.typeLabel, { color: accentColor }]}>⛏  EXTRACTION BEAM</Text>
            {target && (
              <Text style={styles.targetLabel}>TARGET  ·  {target.displayName.toUpperCase()}</Text>
            )}
          </LinearGradient>

          <Text style={styles.subtitle}>BLACKJACK · STAND ON 17 · DEALER HITS SOFT 16</Text>

          {showRulesHint ? (
            <Pressable onPress={dismissRulesHint} style={styles.hintCard}>
              <Text style={styles.hintTitle}>HOW BLACKJACK COMBAT WORKS</Text>
              <Text style={styles.hintBody}>
                Beat the dealer without busting. Higher hand → more power → bigger loot.
              </Text>
              <Text style={styles.hintBody}>
                · 17–19 → 5% of target wallet{'\n'}
                · 20 → 8% of target wallet{'\n'}
                · 21 → 12% of target wallet{'\n'}
                · BLACKJACK (21 in 2) → 12% + max power
              </Text>
              <Text style={styles.hintDismiss}>TAP TO DISMISS</Text>
            </Pressable>
          ) : null}

          {/* Dealer row */}
          <View style={styles.handBlock}>
            <View style={styles.handHeaderRow}>
              <Text style={styles.handLabel}>DEALER</Text>
              <Text style={[styles.handTotal, { color: dealerTotal > 21 ? Colors.danger : Colors.textPrimary }]}>
                {phase === 'PLAYER' ? `${dealerVisibleTotal} + ?` : dealerTotal}
                {phase !== 'PLAYER' && dealerTotal > 21 ? ' BUST' : ''}
              </Text>
            </View>
            <View style={styles.cardRow}>
              {dealer.map((c, i) => (
                <CardView
                  key={`d${i}`}
                  card={c}
                  hidden={phase === 'PLAYER' && i === 1}
                />
              ))}
            </View>
          </View>

          {/* Player row */}
          <View style={styles.handBlock}>
            <View style={styles.handHeaderRow}>
              <Text style={styles.handLabel}>YOU</Text>
              <Text style={[styles.handTotal, { color: playerTotal > 21 ? Colors.danger : Colors.textPrimary }]}>
                {playerTotal}{playerTotal > 21 ? ' BUST' : ''}
              </Text>
            </View>
            <View style={styles.cardRow}>
              {player.map((c, i) => (
                <CardView key={`p${i}`} card={c} />
              ))}
            </View>
          </View>

          {phase === 'DONE' && (
            <>
              <Text style={[styles.outcomeText, { color: won ? Colors.success : Colors.danger }]}>
                {outcome} {won ? '— EXTRACTION SUCCESSFUL' : '— EXTRACTION REPELLED'}
              </Text>
              <CombatResolutionChip won={won} power={sentPower} resolution={resolution} />
            </>
          )}

          {/* Action buttons */}
          {phase === 'PLAYER' && (
            <View style={styles.btnRow}>
              <Pressable onPress={hit} style={[styles.actionBtn, { borderColor: accentColor }]}>
                <Text style={[styles.actionBtnText, { color: accentColor }]}>HIT</Text>
              </Pressable>
              <Pressable onPress={() => stand()} style={[styles.actionBtn, { borderColor: Colors.warning }]}>
                <Text style={[styles.actionBtnText, { color: Colors.warning }]}>STAND</Text>
              </Pressable>
            </View>
          )}

          {phase === 'DONE' && (
            <Pressable onPress={onClose} style={[styles.actionBtn, { borderColor: accentColor, alignSelf: 'center', marginTop: Spacing.sm }]}>
              <Text style={[styles.actionBtnText, { color: accentColor }]}>DISMISS</Text>
            </Pressable>
          )}

        </View>
      </View>
    </Modal>
  );
}

// ─── CardView ────────────────────────────────────────────────────────────────

function CardView({ card, hidden }: { card: Card; hidden?: boolean }) {
  const isRed = card.suit === '♥' || card.suit === '♦';
  if (hidden) {
    return (
      <Animated.View entering={FadeInDown.duration(220)} style={[styles.card, styles.cardBack]}>
        <Text style={styles.cardBackGlyph}>◇</Text>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.card}>
      <Text style={[styles.cardCornerTop, { color: isRed ? Colors.danger : Colors.textPrimary }]}>
        {card.rank}
      </Text>
      <Text style={[styles.cardSuit, { color: isRed ? Colors.danger : Colors.textPrimary }]}>
        {card.suit}
      </Text>
      <Text style={[styles.cardCornerBot, { color: isRed ? Colors.danger : Colors.textPrimary }]}>
        {card.rank}
      </Text>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    width: '88%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    paddingBottom: Spacing.md,
  },
  headerGrad: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  typeLabel: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    letterSpacing: 3,
  },
  targetLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  hintCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.accent + '88',
    backgroundColor: Colors.accent + '11',
    gap: 4,
  },
  hintTitle: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.accent,
    letterSpacing: 2,
  },
  hintBody: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  hintDismiss: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 2,
    textAlign: 'right',
    marginTop: 2,
  },
  handBlock: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  handHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  handLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2.5,
    fontWeight: Typography.weights.bold,
  },
  handTotal: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  card: {
    width: 48,
    height: 68,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardBack: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.accent + '88',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBackGlyph: {
    fontSize: Typography.sizes.xxl,
    color: Colors.accent + 'AA',
  },
  cardCornerTop: {
    alignSelf: 'flex-start',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0,
  },
  cardCornerBot: {
    alignSelf: 'flex-end',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0,
    transform: [{ rotate: '180deg' }],
  },
  cardSuit: {
    fontSize: Typography.sizes.xl,
  },
  outcomeText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
  },
  actionBtnText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    letterSpacing: 3,
  },
});
