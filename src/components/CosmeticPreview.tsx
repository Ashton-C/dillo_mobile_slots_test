import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PilotAvatar } from '@/components/PilotAvatar';
import {
  CosmeticCategory,
  SYMBOL_PACK_GLYPHS,
  REEL_THEME_TOKENS,
  BUTTON_SKIN_TOKENS,
  SUIT_COLOR_MAP,
  BACKGROUND_TOKENS,
  HUD_SKIN_TOKENS,
  EMBLEM_GLYPHS,
  TITLE_LABELS,
} from '@/services/CosmeticsService';
import { Colors, Typography } from '@/constants/theme';

interface Props {
  category: CosmeticCategory;
  itemId: string;
  accentColor: string;
}

export function CosmeticPreview({ category, itemId, accentColor }: Props) {
  switch (category) {
    case 'REEL_THEME': {
      const tokens = REEL_THEME_TOKENS[itemId] ?? REEL_THEME_TOKENS['theme_standard'];
      return (
        <View style={{ width: 60, height: 60, flexDirection: 'row', gap: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.trackBg, borderRadius: 6, borderWidth: 1, borderColor: tokens.borderColor + '66' }}>
          {['◈', '◈', '◈'].map((g, i) => (
            <View key={i} style={{ width: 16, height: 22, borderRadius: 3, backgroundColor: tokens.cellBg, borderWidth: 1, borderColor: tokens.borderColor, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, color: tokens.borderColor }}>{g}</Text>
            </View>
          ))}
        </View>
      );
    }

    case 'SYMBOL_PACK': {
      const glyphs = SYMBOL_PACK_GLYPHS[itemId] ?? SYMBOL_PACK_GLYPHS['sym_default'];
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: accentColor + '66', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <Text style={{ fontSize: 14, color: accentColor, letterSpacing: 2 }}>
            {glyphs.CREDIT_SMALL} {glyphs.CREDIT_MEDIUM} {glyphs.CREDIT_LARGE}
          </Text>
          <Text style={{ fontSize: 12, color: Colors.textSecondary, letterSpacing: 2 }}>
            {glyphs.ATTACK} {glyphs.SHIELD} {glyphs.RAID}
          </Text>
        </View>
      );
    }

    case 'SUIT_COLOR': {
      const suitColor = SUIT_COLOR_MAP[itemId] ?? accentColor;
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: accentColor + '44', alignItems: 'center', justifyContent: 'center' }}>
          <PilotAvatar color={suitColor} size={40} />
        </View>
      );
    }

    case 'EMBLEM': {
      const glyph = EMBLEM_GLYPHS[itemId] ?? '';
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: accentColor + '66', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 28, color: accentColor }}>{glyph || '·'}</Text>
        </View>
      );
    }

    case 'TITLE': {
      const label = TITLE_LABELS[itemId] ?? '';
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: accentColor + '44', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 9, fontWeight: Typography.weights.bold, color: accentColor, letterSpacing: 1, textAlign: 'center' }} numberOfLines={2}>
            {label || '—'}
          </Text>
        </View>
      );
    }

    case 'SPIN_BUTTON': {
      const skin = BUTTON_SKIN_TOKENS[itemId] ?? BUTTON_SKIN_TOKENS['btn_default'];
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: accentColor + '44', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: skin.color, borderWidth: 2, borderColor: skin.glowColor, alignItems: 'center', justifyContent: 'center',
            shadowColor: skin.glowColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 4 }}>
            <Text style={{ fontSize: 10, color: '#FFF', fontWeight: Typography.weights.bold }}>▶</Text>
          </View>
        </View>
      );
    }

    case 'BACKGROUND': {
      const tokens = BACKGROUND_TOKENS[itemId] ?? BACKGROUND_TOKENS['bg_default'];
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: accentColor + '44' }}>
          <LinearGradient
            colors={tokens.gradientColors}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ flex: 1 }}
          />
        </View>
      );
    }

    case 'HUD_SKIN': {
      const skin = HUD_SKIN_TOKENS[itemId] ?? HUD_SKIN_TOKENS['hud_default'];
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: accentColor + '44', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
          <View style={{ width: '100%', height: 16, borderRadius: 3, backgroundColor: skin.backgroundColor, borderWidth: 1, borderColor: skin.borderColor }} />
          <View style={{ width: '80%', height: 8, borderRadius: 2, backgroundColor: skin.backgroundColor, borderWidth: 1, borderColor: skin.borderColor, marginTop: 4 }} />
        </View>
      );
    }

    case 'BUNDLE': {
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: accentColor + '66', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 26, color: accentColor }}>★</Text>
        </View>
      );
    }

    default:
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: accentColor + '33', borderWidth: 1, borderColor: accentColor + '88', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 10, fontWeight: Typography.weights.bold, color: accentColor, letterSpacing: 1 }}>{'??'}</Text>
        </View>
      );
  }
}
