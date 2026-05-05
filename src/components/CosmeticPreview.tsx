import { View, Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PilotAvatar } from '@/components/PilotAvatar';
import {
  CosmeticCategory,
  SYMBOL_PACK_GLYPHS,
  REEL_THEME_TOKENS,
  REEL_THEME_IMAGE_MAP,
  BUTTON_SKIN_TOKENS,
  SUIT_COLOR_MAP,
  SUIT_IMAGE_MAP,
  HELMET_IMAGE_MAP,
  FRAME_IMAGE_MAP,
  NAMEPLATE_IMAGE_MAP,
  ACCESSORY_IMAGE_MAP,
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
      const overlayImg = REEL_THEME_IMAGE_MAP[itemId];
      return (
        <View style={{ width: 60, height: 60, flexDirection: 'row', gap: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.trackBg, borderRadius: 6, borderWidth: 1, borderColor: tokens.borderColor + '66', overflow: 'hidden' }}>
          {overlayImg && (
            <Image source={overlayImg} style={{ position: 'absolute', width: 60, height: 60, opacity: 0.55 }} resizeMode="cover" />
          )}
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
      const renderGlyph = (g: typeof glyphs.CREDIT_SMALL, size: number, color: string, key: string) =>
        typeof g === 'string'
          ? <Text key={key} style={{ fontSize: size, color, letterSpacing: 2, marginHorizontal: 2 }}>{g}</Text>
          : <Image key={key} source={g as any} style={{ width: size + 4, height: size + 4, marginHorizontal: 1 }} resizeMode="contain" />;
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: accentColor + '66', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {renderGlyph(glyphs.CREDIT_SMALL, 12, accentColor, 'a')}
            {renderGlyph(glyphs.CREDIT_MEDIUM, 12, accentColor, 'b')}
            {renderGlyph(glyphs.CREDIT_LARGE, 12, accentColor, 'c')}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {renderGlyph(glyphs.ATTACK, 11, Colors.textSecondary, 'd')}
            {renderGlyph(glyphs.SHIELD, 11, Colors.textSecondary, 'e')}
            {renderGlyph(glyphs.RAID, 11, Colors.textSecondary, 'f')}
          </View>
        </View>
      );
    }

    case 'SUIT_COLOR': {
      const suitColor = SUIT_COLOR_MAP[itemId] ?? accentColor;
      const suitImg   = SUIT_IMAGE_MAP[itemId];
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: accentColor + '44', alignItems: 'center', justifyContent: 'center' }}>
          <PilotAvatar color={suitColor} size={40} useActiveCosmetics={false} suitImage={suitImg} />
        </View>
      );
    }

    case 'HELMET': {
      const helmetImg = HELMET_IMAGE_MAP[itemId];
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: accentColor + '44', alignItems: 'center', justifyContent: 'center' }}>
          <PilotAvatar color={accentColor} size={40} useActiveCosmetics={false} helmetImage={helmetImg} />
        </View>
      );
    }

    case 'FRAME': {
      const frameImg = FRAME_IMAGE_MAP[itemId];
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: accentColor + '44', alignItems: 'center', justifyContent: 'center' }}>
          <PilotAvatar color={accentColor} size={36} useActiveCosmetics={false} frameImage={frameImg} />
        </View>
      );
    }

    case 'NAMEPLATE': {
      const plate = NAMEPLATE_IMAGE_MAP[itemId];
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: accentColor + '44', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {plate
            ? <Image source={plate} style={{ width: 56, height: 28 }} resizeMode="contain" />
            : <Text style={{ fontSize: 9, color: Colors.textMuted, letterSpacing: 1 }}>—</Text>}
        </View>
      );
    }

    case 'ACCESSORY': {
      const accImg = ACCESSORY_IMAGE_MAP[itemId];
      return (
        <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: accentColor + '44', alignItems: 'center', justifyContent: 'center' }}>
          {accImg
            ? <Image source={accImg} style={{ width: 44, height: 44 }} resizeMode="contain" />
            : <Text style={{ fontSize: 9, color: Colors.textMuted, letterSpacing: 1 }}>NONE</Text>}
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
