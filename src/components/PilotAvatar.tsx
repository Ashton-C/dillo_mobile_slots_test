import { View, Image, ImageSourcePropType } from 'react-native';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';
import {
  SUIT_IMAGE_MAP,
  HELMET_IMAGE_MAP,
  FRAME_IMAGE_MAP,
  ACCESSORY_IMAGE_MAP,
  SUIT_COLOR_MAP,
} from '@/services/CosmeticsService';
import { Colors } from '@/constants/theme';

// Legacy avatar accessory type — kept so existing call sites compile while
// the new image-based pipeline takes over via active cosmetics in the store.
export type AvatarAccessory = 'none' | 'visor' | 'helmet' | 'badge' | 'crown';

interface Props {
  color: string;
  size: number;
  // When true (default), the avatar reads helmet/frame/accessory/suit from
  // the active cosmetics store. Set to false to render a flat color avatar
  // (used by previews where we want to show one specific item).
  useActiveCosmetics?: boolean;
  accessory?: AvatarAccessory;
  // Direct overrides for previews
  suitImage?: ImageSourcePropType;
  helmetImage?: ImageSourcePropType;
  frameImage?: ImageSourcePropType;
  accessoryImage?: ImageSourcePropType;
}

function ColorAvatar({ color, size }: { color: string; size: number }) {
  const s = size;
  return (
    <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: color, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: s * 0.42, backgroundColor: 'rgba(0,0,0,0.22)' }}>
        <View style={{ position: 'absolute', top: '32%', left: 0, right: 0, height: 2, backgroundColor: 'rgba(0,0,0,0.32)' }} />
        <View style={{ position: 'absolute', top: '66%', left: 0, right: 0, height: 2, backgroundColor: 'rgba(0,0,0,0.32)' }} />
      </View>
      <View style={{ position: 'absolute', top: s * 0.43, left: s * 0.08, right: s * 0.08, height: s * 0.2, borderRadius: s * 0.04, backgroundColor: 'rgba(0,0,0,0.18)' }} />
      <View style={{ position: 'absolute', left: s * 0.18, top: s * 0.46, width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: s * 0.1, height: s * 0.1, borderRadius: s * 0.05, backgroundColor: Colors.info }} />
      </View>
      <View style={{ position: 'absolute', right: s * 0.18, top: s * 0.46, width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: s * 0.1, height: s * 0.1, borderRadius: s * 0.05, backgroundColor: Colors.info }} />
      </View>
      <View style={{ position: 'absolute', alignSelf: 'center', bottom: s * 0.1, width: s * 0.3, height: s * 0.06, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.25)' }} />
    </View>
  );
}

export function PilotAvatar({
  color,
  size,
  useActiveCosmetics = true,
  suitImage,
  helmetImage,
  frameImage,
  accessoryImage,
}: Props) {
  const activeSuit      = useCosmeticsStore((s) => s.active.SUIT_COLOR);
  const activeHelmet    = useCosmeticsStore((s) => s.active.HELMET);
  const activeFrame     = useCosmeticsStore((s) => s.active.FRAME);
  const activeAccessory = useCosmeticsStore((s) => s.active.ACCESSORY);

  const resolvedSuit      = suitImage      ?? (useActiveCosmetics ? SUIT_IMAGE_MAP[activeSuit]           : undefined);
  const resolvedHelmet    = helmetImage    ?? (useActiveCosmetics ? HELMET_IMAGE_MAP[activeHelmet]        : undefined);
  const resolvedFrame     = frameImage     ?? (useActiveCosmetics ? FRAME_IMAGE_MAP[activeFrame]          : undefined);
  const resolvedAccessory = accessoryImage ?? (useActiveCosmetics ? ACCESSORY_IMAGE_MAP[activeAccessory]  : undefined);

  // Suit tint used to colorize image silhouettes that ship as white/gray.
  const suitColor = useActiveCosmetics ? (SUIT_COLOR_MAP[activeSuit] ?? color) : color;

  const s = size;

  // Frame extends slightly past the avatar so the ring sits around it.
  const FRAME_PAD = s * 0.12;
  const containerSize = s + FRAME_PAD * 2;

  return (
    <View style={{ width: containerSize, height: containerSize, alignItems: 'center', justifyContent: 'center' }}>
      {resolvedFrame && (
        <Image
          source={resolvedFrame}
          style={{ position: 'absolute', width: containerSize, height: containerSize }}
          resizeMode="contain"
        />
      )}
      <View style={{ width: s, height: s, borderRadius: s / 2, overflow: 'hidden', backgroundColor: suitColor + '88' }}>
        {resolvedSuit ? (
          <Image source={resolvedSuit} style={{ width: s, height: s }} resizeMode="cover" />
        ) : (
          <ColorAvatar color={suitColor} size={s} />
        )}
        {resolvedHelmet && (
          <Image
            source={resolvedHelmet}
            style={{
              position: 'absolute',
              top: -s * 0.02,
              left: s * 0.08,
              width: s * 0.84,
              height: s * 0.60,
            }}
            resizeMode="contain"
          />
        )}
        {resolvedAccessory && (
          <Image
            source={resolvedAccessory}
            style={{
              position: 'absolute',
              top: s * 0.54,
              left: (s - s * 0.36) / 2,
              width: s * 0.36,
              height: s * 0.36,
            }}
            resizeMode="contain"
          />
        )}
      </View>
    </View>
  );
}
