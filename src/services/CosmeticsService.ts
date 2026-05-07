import { ImageSourcePropType } from 'react-native';
import { SlotSymbol } from '@/services/SlotsEngine';
import { Colors } from '@/constants/theme';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CosmeticCategory =
  | 'REEL_THEME'
  | 'SYMBOL_PACK'
  | 'SUIT_COLOR'
  | 'HELMET'
  | 'FRAME'
  | 'NAMEPLATE'
  | 'ACCESSORY'
  | 'EMBLEM'
  | 'TITLE'
  | 'SPIN_BUTTON'
  | 'BACKGROUND'
  | 'HUD_SKIN'
  | 'BUNDLE';

export interface CosmeticItem {
  id: string;
  category: CosmeticCategory;
  name: string;
  description: string;
  creditCost: number;   // 0 = free; -1 = IAP only (credit purchase disabled)
  iapPrice?: string;
  featured?: boolean;
  previewColor?: string;
}

// ─── Symbol Pack Glyphs ───────────────────────────────────────────────────────

// A glyph is either a unicode string or an image source (require()) — Reel
// renders Image when typeof glyph === 'number'.
export type SymbolGlyph = string | ImageSourcePropType;
export type SymbolGlyphs = Record<SlotSymbol, SymbolGlyph>;

export const SYMBOL_PACK_GLYPHS: Record<string, SymbolGlyphs> = {
  sym_default: {
    CREDIT_SMALL:  require('../../assets/symbols/cr-small.png'),
    CREDIT_MEDIUM: require('../../assets/symbols/cr-medium.png'),
    CREDIT_LARGE:  require('../../assets/symbols/cr-large.png'),
    ATTACK:        require('../../assets/symbols/fuel.png'),
    RAID:          require('../../assets/symbols/raid.png'),
    SHIELD:        require('../../assets/symbols/shield.png'),
    INTRUSION:     require('../../assets/symbols/attack.png'),
    EXTRACTION:    require('../../assets/symbols/beam.png'),
    EMPTY:         require('../../assets/symbols/empty.png'),
  },
  sym_retro: {
    CREDIT_SMALL:  require('../../assets/cosmetics/symbols-casino/cr-small.png'),
    CREDIT_MEDIUM: require('../../assets/cosmetics/symbols-casino/cr-medium.png'),
    CREDIT_LARGE:  require('../../assets/cosmetics/symbols-casino/cr-large.png'),
    ATTACK:        require('../../assets/cosmetics/symbols-casino/attack.png'),
    RAID:          require('../../assets/cosmetics/symbols-casino/raid.png'),
    SHIELD:        require('../../assets/cosmetics/symbols-casino/shield.png'),
    INTRUSION:     require('../../assets/cosmetics/symbols-casino/attack.png'),
    EXTRACTION:    require('../../assets/cosmetics/symbols-casino/shield.png'),
    EMPTY:         require('../../assets/cosmetics/symbols-casino/empty.png'),
  },
  sym_astro: {
    CREDIT_SMALL: '✦',  CREDIT_MEDIUM: '◎',   CREDIT_LARGE: '☀',
    ATTACK: '⚙', RAID: '⟁', SHIELD: '⊕', INTRUSION: '☽', EXTRACTION: '⬡', EMPTY: '·',
  },
  sym_runic: {
    CREDIT_SMALL: 'ᚢ',  CREDIT_MEDIUM: 'ᚦ',   CREDIT_LARGE: 'ᛟ',
    ATTACK: 'ᛏ', RAID: 'ᚱ', SHIELD: 'ᛉ', INTRUSION: 'ᚷ', EXTRACTION: 'ᛈ', EMPTY: '·',
  },
  sym_circuit: {
    CREDIT_SMALL:  require('../../assets/cosmetics/symbols-pixel/cr-small.png'),
    CREDIT_MEDIUM: require('../../assets/cosmetics/symbols-pixel/cr-medium.png'),
    CREDIT_LARGE:  require('../../assets/cosmetics/symbols-pixel/cr-large.png'),
    ATTACK:        require('../../assets/cosmetics/symbols-pixel/attack.png'),
    RAID:          require('../../assets/cosmetics/symbols-pixel/raid.png'),
    SHIELD:        require('../../assets/cosmetics/symbols-pixel/shield.png'),
    INTRUSION:     require('../../assets/cosmetics/symbols-pixel/attack.png'),
    EXTRACTION:    require('../../assets/cosmetics/symbols-pixel/shield.png'),
    EMPTY:         require('../../assets/cosmetics/symbols-pixel/empty.png'),
  },
  sym_squad: {
    CREDIT_SMALL: '⬡',  CREDIT_MEDIUM: '⬢',   CREDIT_LARGE: '⬣',
    ATTACK: '⟡', RAID: '⊛', SHIELD: '⊗', INTRUSION: '⊘', EXTRACTION: '⊙', EMPTY: '·',
  },
};

// ─── Reel Theme Tokens ────────────────────────────────────────────────────────

export interface ReelThemeTokens {
  trackBg: string;
  cellBg: string;
  borderColor: string;
  midRowBg: string;
}

export const REEL_THEME_TOKENS: Record<string, ReelThemeTokens> = {
  theme_standard:   { trackBg: Colors.surface,  cellBg: Colors.surfaceElevated, borderColor: Colors.border,  midRowBg: Colors.surfaceElevated + '80' },
  theme_neon:       { trackBg: '#0A0A1E',        cellBg: '#0F0F2A',             borderColor: '#9B59FF',      midRowBg: '#9B59FF22' },
  theme_cyber:      { trackBg: '#1A1400',        cellBg: '#221900',             borderColor: '#FFD700',      midRowBg: '#FFD70022' },
  theme_void_matrix:{ trackBg: '#050F05',        cellBg: '#0A180A',             borderColor: '#00FF41',      midRowBg: '#00FF4122' },
  theme_solar_flare:{ trackBg: '#1A0A00',        cellBg: '#220E00',             borderColor: '#FF6B35',      midRowBg: '#FF6B3522' },
  theme_deep_reef:  { trackBg: '#001218',        cellBg: '#001C24',             borderColor: '#00D4FF',      midRowBg: '#00D4FF22' },
  theme_arctic:     { trackBg: '#0A1020',        cellBg: '#0E1828',             borderColor: '#AAD4FF',      midRowBg: '#AAD4FF22' },
  theme_blood_moon: { trackBg: '#120005',        cellBg: '#1A0008',             borderColor: '#CC2244',      midRowBg: '#CC224422' },
  theme_frontier:   { trackBg: '#1A0E04',        cellBg: '#22150A',             borderColor: '#A06A35',      midRowBg: '#A06A3522' },
  theme_mono:       { trackBg: '#0E0E10',        cellBg: '#15151A',             borderColor: '#777',         midRowBg: '#FFFFFF12' },
  theme_outlaw:     { trackBg: '#180204',        cellBg: '#220308',             borderColor: '#CC2244',      midRowBg: '#CC224422' },
  theme_rift:       { trackBg: '#0E0420',        cellBg: '#16092E',             borderColor: '#9B59FF',      midRowBg: '#9B59FF22' },
  theme_station:    { trackBg: '#08121A',        cellBg: '#0E1A22',             borderColor: '#5BB3DE',      midRowBg: '#5BB3DE22' },
  theme_vault:      { trackBg: '#0F0A02',        cellBg: '#1A1206',             borderColor: '#C49A00',      midRowBg: '#C49A0022' },
};

// ─── Spin Button Skin Tokens ──────────────────────────────────────────────────

export interface ButtonSkinTokens {
  color: string;
  dimColor: string;
  glowColor: string;
}

export const BUTTON_SKIN_TOKENS: Record<string, ButtonSkinTokens> = {
  btn_default: { color: Colors.primary,  dimColor: Colors.primaryDim,  glowColor: Colors.primary  },
  btn_reactor: { color: '#0088FF',        dimColor: '#005599',          glowColor: '#00AAFF'       },
  btn_crimson: { color: '#CC2244',        dimColor: '#881133',          glowColor: '#FF2255'       },
  btn_void:    { color: Colors.accent,   dimColor: Colors.accentDim,   glowColor: Colors.accent   },
  btn_gold:    { color: '#C49A00',        dimColor: '#886800',          glowColor: '#FFD700'       },
  btn_hexagon: { color: '#00AA88',        dimColor: '#006655',          glowColor: '#00CCAA'       },
};

// ─── Suit Color Map ───────────────────────────────────────────────────────────

export const SUIT_COLOR_MAP: Record<string, string> = {
  suit_default: Colors.primary,
  suit_void:    Colors.accent,
  suit_neon:    '#FF2D78',
  suit_acid:    Colors.success,
  suit_ice:     Colors.shield,
  suit_crimson: '#CC2244',
  suit_phantom: '#8888BB',
  suit_solar:   '#FFB800',
  suit_emerald: '#22AA66',
  suit_nebula:  Colors.gradientMid,
};

// ─── Image Asset Maps ─────────────────────────────────────────────────────────
// Image-based pilot cosmetics. Returns null when the id has no image (legacy
// color-tint suits, the "none" defaults, etc) so the renderer can fall back.

export const SUIT_IMAGE_MAP: Record<string, ImageSourcePropType | undefined> = {
  suit_default:    require('../../assets/cosmetics/suits/standard.png'),
  suit_duster:     require('../../assets/cosmetics/suits/duster.png'),
  suit_outlaw:     require('../../assets/cosmetics/suits/outlaw.png'),
  suit_riftwalker: require('../../assets/cosmetics/suits/riftwalker.png'),
  suit_sovereign:  require('../../assets/cosmetics/suits/sovereign.png'),
};

export const HELMET_IMAGE_MAP: Record<string, ImageSourcePropType | undefined> = {
  helmet_none:       undefined,
  helmet_standard:   require('../../assets/cosmetics/helmets/standard.png'),
  helmet_gilded:     require('../../assets/cosmetics/helmets/gilded.png'),
  helmet_outlaw:     require('../../assets/cosmetics/helmets/outlaw.png'),
  helmet_ranger:     require('../../assets/cosmetics/helmets/ranger.png'),
  helmet_riftwalker: require('../../assets/cosmetics/helmets/riftwalker.png'),
  helmet_sovereign:  require('../../assets/cosmetics/helmets/sovereign.png'),
};

export const FRAME_IMAGE_MAP: Record<string, ImageSourcePropType | undefined> = {
  frame_none:       undefined,
  frame_standard:   require('../../assets/cosmetics/frames/standard.png'),
  frame_ranger:     require('../../assets/cosmetics/frames/ranger.png'),
  frame_riftwalker: require('../../assets/cosmetics/frames/riftwalker.png'),
  frame_sovereign:  require('../../assets/cosmetics/frames/sovereign.png'),
};

export const NAMEPLATE_IMAGE_MAP: Record<string, ImageSourcePropType | undefined> = {
  nameplate_none:       undefined,
  nameplate_standard:   require('../../assets/cosmetics/nameplates/standard.png'),
  nameplate_ranger:     require('../../assets/cosmetics/nameplates/ranger.png'),
  nameplate_riftwalker: require('../../assets/cosmetics/nameplates/riftwalker.png'),
  nameplate_sovereign:  require('../../assets/cosmetics/nameplates/sovereign.png'),
};

// React-rendered nameplate styling tokens. Lets us draw a banner without
// depending on the static PNG. Each preset defines the gradient, border and
// inner accent of the chip displayed behind the pilot's name.
export interface NameplateStyle {
  gradient: readonly [string, string];
  borderColor: string;
  accentColor: string;
  textColor: string;
}

export const NAMEPLATE_STYLES: Record<string, NameplateStyle> = {
  nameplate_none:       { gradient: ['#1A1A2E',   '#1A1A2E'],   borderColor: Colors.border,        accentColor: Colors.textMuted,    textColor: Colors.textPrimary },
  nameplate_standard:   { gradient: ['#22223A',   '#161628'],   borderColor: Colors.textSecondary, accentColor: Colors.textSecondary, textColor: Colors.textPrimary },
  nameplate_ranger:     { gradient: ['#0E2A14',   '#06140A'],   borderColor: Colors.success,       accentColor: Colors.success,      textColor: Colors.textPrimary },
  nameplate_riftwalker: { gradient: ['#1A0A2E',   '#0A0420'],   borderColor: Colors.accent,        accentColor: Colors.accent,       textColor: Colors.textPrimary },
  nameplate_sovereign:  { gradient: ['#3A2A02',   '#1A1200'],   borderColor: Colors.credits,       accentColor: Colors.credits,      textColor: Colors.credits     },
};

export const ACCESSORY_IMAGE_MAP: Record<string, ImageSourcePropType | undefined> = {
  acc_none:           undefined,
  acc_badge_ranger:   require('../../assets/cosmetics/accessories/badge-ranger.png'),
  acc_pin_pilot:      require('../../assets/cosmetics/accessories/pin-pilot.png'),
  acc_sash_sovereign: require('../../assets/cosmetics/accessories/sash-sovereign.png'),
  acc_scarf_frontier: require('../../assets/cosmetics/accessories/scarf-frontier.png'),
  acc_visor_jewel:    require('../../assets/cosmetics/accessories/visor-jewel.png'),
};

// Reel theme background art — overlaid on the reel-track background when set.
export const REEL_THEME_IMAGE_MAP: Record<string, ImageSourcePropType | undefined> = {
  theme_standard:   undefined,
  theme_frontier:   require('../../assets/cosmetics/reels/frontier.png'),
  theme_mono:       require('../../assets/cosmetics/reels/mono.png'),
  theme_outlaw:     require('../../assets/cosmetics/reels/outlaw.png'),
  theme_rift:       require('../../assets/cosmetics/reels/rift.png'),
  theme_station:    require('../../assets/cosmetics/reels/station.png'),
  theme_vault:      require('../../assets/cosmetics/reels/vault.png'),
};

// ─── HUD Skin Tokens ──────────────────────────────────────────────────────────

export interface HudSkinTokens {
  backgroundColor: string;
  borderColor: string;
}

export const HUD_SKIN_TOKENS: Record<string, HudSkinTokens> = {
  hud_default:  { backgroundColor: Colors.surface,             borderColor: Colors.border          },
  hud_holo:     { backgroundColor: 'rgba(0,100,255,0.08)',     borderColor: '#0066FF44'             },
  hud_tactical: { backgroundColor: 'rgba(0,80,20,0.18)',       borderColor: '#00AA4444'             },
  hud_quantum:  { backgroundColor: 'rgba(155,89,255,0.10)',    borderColor: Colors.accent + '44'   },
  hud_minimal:  { backgroundColor: 'rgba(255,255,255,0.03)',   borderColor: 'transparent'           },
};

// ─── Background Tokens ────────────────────────────────────────────────────────

export interface BackgroundTokens {
  gradientColors: readonly [string, string, string];
}

export const BACKGROUND_TOKENS: Record<string, BackgroundTokens> = {
  bg_default:   { gradientColors: [Colors.gradientStart + '55', Colors.gradientMid + '33', Colors.background] },
  bg_nebula:    { gradientColors: ['#9B59FF55', '#CC44AA33', Colors.background] },
  bg_city_rain: { gradientColors: ['#001133AA', '#003366AA', Colors.background] },
  bg_solar:     { gradientColors: ['#FF6B3566', '#FFD70033', Colors.background] },
  bg_void_rift: { gradientColors: ['#9B59FF88', '#33006688', Colors.background] },
  bg_submerged: { gradientColors: ['#00D4FF44', '#00668833', Colors.background] },
};

// ─── Emblem Glyphs ────────────────────────────────────────────────────────────

export const EMBLEM_GLYPHS: Record<string, string> = {
  emblem_none:      '',
  emblem_ace:       '✈',
  emblem_warlord:   '⚔',
  emblem_vault:     '⊗',
  emblem_star_cmd:  '★',
  emblem_void:      '◌',
  emblem_chromatic: '◆',
};

// ─── Title Labels ─────────────────────────────────────────────────────────────

export const TITLE_LABELS: Record<string, string> = {
  title_none:     '',
  title_cmdr:     'COMMANDER',
  title_warlord:  'WARLORD',
  title_phantom:  'PHANTOM',
  title_oracle:   'ORACLE',
  title_sovereign:'MARSHAL',
  title_void_adm: 'VOID ADMIRAL',
};

// ─── Default Active Selections ────────────────────────────────────────────────

export const COSMETIC_ACTIVE_DEFAULTS: Record<CosmeticCategory, string> = {
  REEL_THEME:  'theme_standard',
  SYMBOL_PACK: 'sym_default',
  SUIT_COLOR:  'suit_default',
  HELMET:      'helmet_none',
  FRAME:       'frame_none',
  NAMEPLATE:   'nameplate_none',
  ACCESSORY:   'acc_none',
  EMBLEM:      'emblem_none',
  TITLE:       'title_none',
  SPIN_BUTTON: 'btn_default',
  BACKGROUND:  'bg_default',
  HUD_SKIN:    'hud_default',
  BUNDLE:      '',
};

// IDs that are free/always owned
export const FREE_COSMETIC_IDS = new Set([
  'theme_standard', 'sym_default', 'suit_default', 'suit_void',
  'emblem_none', 'title_none', 'btn_default', 'bg_default', 'hud_default',
  'helmet_none', 'helmet_standard',
  'frame_none',  'frame_standard',
  'nameplate_none', 'nameplate_standard',
  'acc_none',
]);

// ─── Full Catalog ─────────────────────────────────────────────────────────────

export const COSMETICS_CATALOG: CosmeticItem[] = [
  // Reel Themes
  { id: 'theme_neon',         category: 'REEL_THEME',  name: 'NEON PULSE',      description: 'Electric purple glow aesthetic',     creditCost: 1000,  previewColor: '#9B59FF' },
  { id: 'theme_cyber',        category: 'REEL_THEME',  name: 'CYBER GOLD',      description: 'Gold & chrome finish',               creditCost: 1000,  previewColor: '#FFD700' },
  { id: 'theme_void_matrix',  category: 'REEL_THEME',  name: 'VOID MATRIX',     description: 'Terminal green on deep black',       creditCost: 1000,  previewColor: '#00FF41' },
  { id: 'theme_solar_flare',  category: 'REEL_THEME',  name: 'SOLAR FLARE',     description: 'Warm amber-to-red gradient',         creditCost: 1000,  previewColor: '#FF6B35' },
  { id: 'theme_deep_reef',    category: 'REEL_THEME',  name: 'DEEP REEF',       description: 'Bioluminescent teal glow pulse',     creditCost: 1500,  previewColor: '#00D4FF', featured: true },
  { id: 'theme_arctic',       category: 'REEL_THEME',  name: 'ARCTIC STATION',  description: 'Frosted glass, ice-blue minimal',   creditCost: 1500,  previewColor: '#AAD4FF' },
  { id: 'theme_blood_moon',   category: 'REEL_THEME',  name: 'BLOOD MOON',      description: 'Crimson horror, cracked-glass feel', creditCost: -1,    iapPrice: '$1.99', previewColor: '#CC2244' },

  // Symbol Packs
  { id: 'sym_retro',    category: 'SYMBOL_PACK', name: 'CASINO CHROME', description: 'Polished casino-floor icon set',     creditCost: 800,  previewColor: Colors.warning },
  { id: 'sym_astro',    category: 'SYMBOL_PACK', name: 'ASTRO',        description: 'Planets, suns, moon glyphs',          creditCost: 800,  previewColor: Colors.info },
  { id: 'sym_runic',    category: 'SYMBOL_PACK', name: 'RUNIC',        description: 'Norse rune stones — ᚦ ᚱ ᛟ',           creditCost: 800,  previewColor: Colors.textSecondary },
  { id: 'sym_circuit',  category: 'SYMBOL_PACK', name: 'PIXEL DRIFTER', description: '8-bit pixel-art slot icons',         creditCost: 1200, previewColor: Colors.success },
  { id: 'sym_squad',    category: 'SYMBOL_PACK', name: 'TACTICAL SQUAD', description: 'Tactical squad icon set',            creditCost: -1,   iapPrice: '$1.99', previewColor: Colors.primary, featured: true },

  // Suit Colors
  { id: 'suit_crimson', category: 'SUIT_COLOR', name: 'CRIMSON CORE', description: 'Deep red pilot suit',          creditCost: 500,  previewColor: '#CC2244' },
  { id: 'suit_phantom', category: 'SUIT_COLOR', name: 'PHANTOM',      description: 'Silver-mist ghost tone',       creditCost: 500,  previewColor: '#8888BB' },
  { id: 'suit_solar',   category: 'SUIT_COLOR', name: 'SOLAR BURST',  description: 'Bright gold chassis',         creditCost: 500,  previewColor: '#FFB800' },
  { id: 'suit_emerald', category: 'SUIT_COLOR', name: 'EMERALD',      description: 'Rich forest green',           creditCost: 750,  previewColor: '#22AA66' },
  { id: 'suit_nebula',  category: 'SUIT_COLOR', name: 'NEBULA',       description: 'Shifting gradient finish',    creditCost: -1,   iapPrice: '$0.99', previewColor: Colors.gradientMid, featured: true },
  { id: 'suit_neon',    category: 'SUIT_COLOR', name: 'NEON PINK',    description: 'Hot pink neon suit',          creditCost: 500,  previewColor: '#FF2D78' },
  { id: 'suit_acid',    category: 'SUIT_COLOR', name: 'ACID',         description: 'Toxic lime green',            creditCost: 500,  previewColor: Colors.success },
  { id: 'suit_ice',     category: 'SUIT_COLOR', name: 'ICE',          description: 'Arctic cyan frost',           creditCost: 500,  previewColor: Colors.shield },

  // Emblems
  { id: 'emblem_ace',       category: 'EMBLEM', name: 'ACE',          description: 'Aviator wings badge',      creditCost: 300  },
  { id: 'emblem_warlord',   category: 'EMBLEM', name: 'WARLORD',      description: 'Crossed blades emblem',    creditCost: 300  },
  { id: 'emblem_vault',     category: 'EMBLEM', name: 'VAULT HUNTER', description: 'Skull & crossbones',      creditCost: 600  },
  { id: 'emblem_star_cmd',  category: 'EMBLEM', name: 'STAR CMD',     description: 'Gold 5-point star',       creditCost: 1200 },
  { id: 'emblem_void',      category: 'EMBLEM', name: 'VOID WALKER',  description: 'Glowing empty circle',    creditCost: 1200 },
  { id: 'emblem_chromatic', category: 'EMBLEM', name: 'CHROMATIC',    description: 'Rainbow-cycling diamond', creditCost: -1, iapPrice: '$1.99', featured: true },

  // Titles
  { id: 'title_cmdr',      category: 'TITLE', name: 'COMMANDER',    description: 'Military rank prefix',      creditCost: 200  },
  { id: 'title_warlord',   category: 'TITLE', name: 'WARLORD',      description: 'Aggressive raider prefix',  creditCost: 400  },
  { id: 'title_phantom',   category: 'TITLE', name: 'PHANTOM',      description: 'Ghost operative prefix',   creditCost: 400  },
  { id: 'title_oracle',    category: 'TITLE', name: 'ORACLE',       description: 'Mystic strategist prefix', creditCost: 800  },
  { id: 'title_sovereign', category: 'TITLE', name: 'MARSHAL',      description: 'Frontier prestige prefix', creditCost: -1,  iapPrice: '$1.99' },
  { id: 'title_void_adm',  category: 'TITLE', name: 'VOID ADMIRAL', description: 'Ultimate prestige',        creditCost: -1,  iapPrice: '$4.99' },

  // Spin Button Skins
  { id: 'btn_reactor', category: 'SPIN_BUTTON', name: 'REACTOR CORE', description: 'Pulsing plasma blue',       creditCost: 1000, previewColor: '#0088FF' },
  { id: 'btn_crimson', category: 'SPIN_BUTTON', name: 'CRIMSON ORB',  description: 'Deep red fire-border',      creditCost: 1000, previewColor: '#CC2244' },
  { id: 'btn_void',    category: 'SPIN_BUTTON', name: 'VOID SPHERE',  description: 'Purple starfield button',   creditCost: 1500, previewColor: Colors.accent },
  { id: 'btn_gold',    category: 'SPIN_BUTTON', name: 'GOLD DISC',    description: 'Metallic gold finish',      creditCost: -1,   iapPrice: '$0.99', previewColor: '#FFD700', featured: true },
  { id: 'btn_hexagon', category: 'SPIN_BUTTON', name: 'HEXAGON',      description: 'Geometric hex shape',       creditCost: 1500, previewColor: '#00CCAA' },

  // Backgrounds
  { id: 'bg_nebula',    category: 'BACKGROUND', name: 'NEBULA DRIFT',  description: 'Colorful nebula clouds',    creditCost: 1000, previewColor: '#9B59FF' },
  { id: 'bg_city_rain', category: 'BACKGROUND', name: 'CITY RAIN',     description: 'Cyberpunk neon cityscape',  creditCost: 1500, previewColor: Colors.info },
  { id: 'bg_solar',     category: 'BACKGROUND', name: 'SOLAR CORONA',  description: 'Sun-surface plasma loops',  creditCost: 1500, previewColor: Colors.warning },
  { id: 'bg_void_rift', category: 'BACKGROUND', name: 'VOID RIFT',     description: 'Dimensional rift crackling',creditCost: -1,   iapPrice: '$1.99', previewColor: Colors.accent, featured: true },
  { id: 'bg_submerged', category: 'BACKGROUND', name: 'SUBMERGED',     description: 'Bioluminescent underwater', creditCost: -1,   iapPrice: '$1.99', previewColor: '#00D4FF' },

  // HUD Skins
  { id: 'hud_holo',     category: 'HUD_SKIN', name: 'HOLOGRAPHIC',   description: 'Semi-transparent scan-line HUD', creditCost: 1000, previewColor: '#0066FF' },
  { id: 'hud_tactical', category: 'HUD_SKIN', name: 'TACTICAL',      description: 'Military green grid overlay',    creditCost: 800,  previewColor: '#00AA44' },
  { id: 'hud_quantum',  category: 'HUD_SKIN', name: 'QUANTUM',       description: 'Iridescent quantum-dot style',  creditCost: 1500, previewColor: Colors.accent },
  { id: 'hud_minimal',  category: 'HUD_SKIN', name: 'MINIMAL GLASS', description: 'Frosted glass, no borders',     creditCost: 600,  previewColor: Colors.textSecondary },

  // Helmets — pilot avatar headgear images
  { id: 'helmet_gilded',     category: 'HELMET', name: 'GILDED CREST',  description: 'Polished brass aviator helm',     creditCost: 1200, previewColor: '#FFD700' },
  { id: 'helmet_outlaw',     category: 'HELMET', name: 'OUTLAW HOOD',   description: 'Battered frontier headwrap',      creditCost: 800,  previewColor: '#CC2244' },
  { id: 'helmet_ranger',     category: 'HELMET', name: 'RANGER HELM',   description: 'Standard-issue patrol helmet',    creditCost: 600,  previewColor: Colors.success },
  { id: 'helmet_riftwalker', category: 'HELMET', name: 'RIFTWALKER',    description: 'Voidproof gravity helm',          creditCost: 1500, previewColor: Colors.accent, featured: true },
  { id: 'helmet_sovereign',  category: 'HELMET', name: 'SOVEREIGN',     description: 'Crowned marshal headgear',        creditCost: -1,   iapPrice: '$1.99', previewColor: Colors.credits },

  // Frames — avatar ring around the pilot portrait
  { id: 'frame_ranger',     category: 'FRAME', name: 'RANGER FRAME',    description: 'Patrol-corps avatar frame',     creditCost: 500,  previewColor: Colors.success },
  { id: 'frame_riftwalker', category: 'FRAME', name: 'RIFTWALKER',      description: 'Void-glow avatar ring',         creditCost: 1000, previewColor: Colors.accent },
  { id: 'frame_sovereign',  category: 'FRAME', name: 'SOVEREIGN',       description: 'Gilded marshal frame',          creditCost: -1,   iapPrice: '$0.99', previewColor: Colors.credits, featured: true },

  // Nameplates — pilot name banner backdrop
  { id: 'nameplate_ranger',     category: 'NAMEPLATE', name: 'RANGER',     description: 'Standard patrol nameplate',  creditCost: 300, previewColor: Colors.success },
  { id: 'nameplate_riftwalker', category: 'NAMEPLATE', name: 'RIFTWALKER', description: 'Void-etched nameplate',      creditCost: 800, previewColor: Colors.accent },
  { id: 'nameplate_sovereign',  category: 'NAMEPLATE', name: 'SOVEREIGN',  description: 'Marshal-tier nameplate',     creditCost: -1,  iapPrice: '$0.99', previewColor: Colors.credits },

  // Accessories — small badge/pin overlays on the pilot
  { id: 'acc_badge_ranger',   category: 'ACCESSORY', name: 'RANGER BADGE',   description: 'Patrol-corps shoulder badge',     creditCost: 250, previewColor: Colors.success },
  { id: 'acc_pin_pilot',      category: 'ACCESSORY', name: 'PILOT PIN',      description: 'Aviator wing lapel pin',          creditCost: 250, previewColor: Colors.primary },
  { id: 'acc_scarf_frontier', category: 'ACCESSORY', name: 'FRONTIER SCARF', description: 'Dust-storm pilot scarf',          creditCost: 400, previewColor: '#CC2244' },
  { id: 'acc_visor_jewel',    category: 'ACCESSORY', name: 'JEWEL VISOR',    description: 'Inset gem visor flair',           creditCost: 800, previewColor: Colors.accent },
  { id: 'acc_sash_sovereign', category: 'ACCESSORY', name: 'SOVEREIGN SASH', description: 'Marshal ceremonial sash',         creditCost: -1,  iapPrice: '$0.99', previewColor: Colors.credits, featured: true },

  // Image-based suits (replaces color-tint defaults for these IDs)
  { id: 'suit_duster',     category: 'SUIT_COLOR', name: 'DUSTER',     description: 'Long-coat frontier rig',     creditCost: 600,  previewColor: '#A06A35' },
  { id: 'suit_outlaw',     category: 'SUIT_COLOR', name: 'OUTLAW',     description: 'Battered scavenger plates',  creditCost: 700,  previewColor: '#CC2244' },
  { id: 'suit_riftwalker', category: 'SUIT_COLOR', name: 'RIFTWALKER', description: 'Void-tempered exo-suit',     creditCost: 1200, previewColor: Colors.accent },
  { id: 'suit_sovereign',  category: 'SUIT_COLOR', name: 'SOVEREIGN',  description: 'Marshal command armor',      creditCost: -1,   iapPrice: '$1.99', previewColor: Colors.credits },

  // Reel theme art (overlay images on the reel track)
  { id: 'theme_frontier', category: 'REEL_THEME', name: 'FRONTIER',   description: 'Dust-haze frontier theme',    creditCost: 800,  previewColor: '#A06A35' },
  { id: 'theme_mono',     category: 'REEL_THEME', name: 'MONO',       description: 'Monochrome minimal track',    creditCost: 500,  previewColor: Colors.textSecondary },
  { id: 'theme_outlaw',   category: 'REEL_THEME', name: 'OUTLAW',     description: 'Crimson outlaw theme',        creditCost: 800,  previewColor: '#CC2244' },
  { id: 'theme_rift',     category: 'REEL_THEME', name: 'RIFT',       description: 'Voidwarp rift overlay',       creditCost: 1200, previewColor: Colors.accent },
  { id: 'theme_station',  category: 'REEL_THEME', name: 'STATION',    description: 'Orbital-station chrome',      creditCost: 1000, previewColor: Colors.info },
  { id: 'theme_vault',    category: 'REEL_THEME', name: 'VAULT',      description: 'Armored vault-tier theme',    creditCost: -1,   iapPrice: '$1.99', previewColor: Colors.credits },

  // Bundles (IAP only — grant multiple items on purchase)
  { id: 'bundle_pilot',   category: 'BUNDLE', name: 'PILOT STARTER',    description: 'RETRO ARCADE + CRIMSON CORE + 2,000 CR', creditCost: -1, iapPrice: '$2.99', featured: true },
  { id: 'bundle_cmdr',    category: 'BUNDLE', name: 'COMMANDER PACK',   description: 'DEEP REEF theme + TACTICAL HUD + ACE emblem', creditCost: -1, iapPrice: '$4.99' },
  { id: 'bundle_founder', category: 'BUNDLE', name: "FOUNDER'S EDITION",description: 'CHROMATIC + NEBULA suit + VOID RIFT + MARSHAL',    creditCost: -1, iapPrice: '$9.99', featured: true },
];

// ─── Bundle Grants ────────────────────────────────────────────────────────────

export const BUNDLE_GRANTS: Record<string, { ids: string[]; bonusCredits?: number }> = {
  bundle_pilot:   { ids: ['sym_retro', 'suit_crimson'],          bonusCredits: 2000 },
  bundle_cmdr:    { ids: ['theme_deep_reef', 'hud_tactical', 'emblem_ace'] },
  bundle_founder: { ids: ['emblem_chromatic', 'suit_nebula', 'bg_void_rift', 'title_sovereign'] },
};
