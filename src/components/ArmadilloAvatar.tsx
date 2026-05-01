import { View } from 'react-native';
import { Colors } from '@/constants/theme';

export type AvatarAccessory = 'none' | 'visor' | 'helmet' | 'badge' | 'crown';

interface Props {
  color: string;
  size: number;
  accessory?: AvatarAccessory;
}

export function ArmadilloAvatar({ color, size, accessory = 'none' }: Props) {
  const s = size;
  return (
    <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: color, overflow: 'hidden' }}>

      {/* Shell region — top 42%, darker with two armor band lines */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: s * 0.42, backgroundColor: 'rgba(0,0,0,0.22)' }}>
        <View style={{ position: 'absolute', top: '32%', left: 0, right: 0, height: 2, backgroundColor: 'rgba(0,0,0,0.32)' }} />
        <View style={{ position: 'absolute', top: '66%', left: 0, right: 0, height: 2, backgroundColor: 'rgba(0,0,0,0.32)' }} />
      </View>

      {/* Helmet overlay — covers top 35% with a solid cap */}
      {accessory === 'helmet' && (
        <View style={{ position: 'absolute', top: 0, left: s * 0.06, right: s * 0.06, height: s * 0.35, backgroundColor: 'rgba(0,180,255,0.35)', borderBottomLeftRadius: s * 0.12, borderBottomRightRadius: s * 0.12 }} />
      )}

      {/* Crown — three points at the top */}
      {accessory === 'crown' && (
        <>
          <View style={{ position: 'absolute', top: -s * 0.04, left: s * 0.32, width: s * 0.12, height: s * 0.22, backgroundColor: Colors.credits, borderRadius: 2 }} />
          <View style={{ position: 'absolute', top: -s * 0.04, left: s * 0.20, width: s * 0.1, height: s * 0.16, backgroundColor: Colors.credits, borderRadius: 2 }} />
          <View style={{ position: 'absolute', top: -s * 0.04, right: s * 0.20, width: s * 0.1, height: s * 0.16, backgroundColor: Colors.credits, borderRadius: 2 }} />
        </>
      )}

      {/* Visor band spanning the eye region */}
      <View style={{ position: 'absolute', top: s * 0.43, left: s * 0.08, right: s * 0.08, height: s * 0.2, borderRadius: s * 0.04, backgroundColor: 'rgba(0,0,0,0.18)' }} />

      {/* Visor tint — colored overlay on visor band */}
      {accessory === 'visor' && (
        <View style={{ position: 'absolute', top: s * 0.43, left: s * 0.08, right: s * 0.08, height: s * 0.2, borderRadius: s * 0.04, backgroundColor: 'rgba(155,89,255,0.40)' }} />
      )}

      {/* Left eye socket + glowing pupil */}
      <View style={{ position: 'absolute', left: s * 0.18, top: s * 0.46, width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: s * 0.1, height: s * 0.1, borderRadius: s * 0.05, backgroundColor: Colors.info }} />
      </View>

      {/* Right eye socket + glowing pupil */}
      <View style={{ position: 'absolute', right: s * 0.18, top: s * 0.46, width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: s * 0.1, height: s * 0.1, borderRadius: s * 0.05, backgroundColor: Colors.info }} />
      </View>

      {/* Snout */}
      <View style={{ position: 'absolute', alignSelf: 'center', bottom: s * 0.1, width: s * 0.3, height: s * 0.22, borderRadius: s * 0.12, backgroundColor: 'rgba(0,0,0,0.16)' }} />

      {/* Badge — small star in the lower-right */}
      {accessory === 'badge' && (
        <View style={{ position: 'absolute', right: s * 0.05, bottom: s * 0.05, width: s * 0.22, height: s * 0.22, borderRadius: s * 0.11, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.12, height: s * 0.12, borderRadius: s * 0.06, backgroundColor: Colors.credits }} />
        </View>
      )}
    </View>
  );
}
