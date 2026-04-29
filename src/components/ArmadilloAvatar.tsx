import { View } from 'react-native';
import { Colors } from '@/constants/theme';

interface Props {
  color: string;
  size: number;
}

export function ArmadilloAvatar({ color, size }: Props) {
  const s = size;
  return (
    <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: color, overflow: 'hidden' }}>

      {/* Shell region — top 42%, darker with two armor band lines */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: s * 0.42, backgroundColor: 'rgba(0,0,0,0.22)' }}>
        <View style={{ position: 'absolute', top: '32%', left: 0, right: 0, height: 2, backgroundColor: 'rgba(0,0,0,0.32)' }} />
        <View style={{ position: 'absolute', top: '66%', left: 0, right: 0, height: 2, backgroundColor: 'rgba(0,0,0,0.32)' }} />
      </View>

      {/* Visor band spanning the eye region */}
      <View style={{ position: 'absolute', top: s * 0.43, left: s * 0.08, right: s * 0.08, height: s * 0.2, borderRadius: s * 0.04, backgroundColor: 'rgba(0,0,0,0.18)' }} />

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
    </View>
  );
}
