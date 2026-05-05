export const Colors = {
  background: '#0D0D1A',
  surface: '#161628',
  surfaceElevated: '#1E1E38',
  border: '#2A2A4A',

  primary: '#FF6B35',
  primaryDim: '#CC5522',
  accent: '#9B59FF',
  accentDim: '#6B3ABF',

  gradientStart: '#FF6B35',
  gradientMid: '#CC44AA',
  gradientEnd: '#9B59FF',

  textPrimary: '#F0F0FF',
  textSecondary: '#8888BB',
  textMuted: '#4A4A7A',

  success: '#39FF14',
  warning: '#FFD700',
  danger: '#FF3366',
  info: '#00D4FF',

  credits: '#FFD700',
  attack: '#FF3366',
  raid: '#FF6B35',
  shield: '#00D4FF',
} as const;

export const Typography = {
  fontFamily: 'SpaceMono',
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    hero: 48,
  },
  weights: {
    light: '300' as const,
    regular: '400' as const,
    medium: '500' as const,
    bold: '700' as const,
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BorderRadius = {
  sm: 6,
  md: 12,
  lg: 20,
  full: 999,
} as const;
