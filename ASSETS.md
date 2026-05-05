# Asset Checklist — Reelwright

Everything the app references but doesn't yet ship. Drop files into the listed paths and they're picked up automatically (no code change required for sounds — `SoundService.ts` already wires keys to a `require()` map; just swap each `null` for `require('../assets/...')`).

---

## Sounds — `assets/sounds/` (all missing)

`src/services/SoundService.ts` declares 14 SFX slots, all currently `null`. Recommended format: **mono MP3, 44.1 kHz, ~0.3–1.5 s, normalized to −6 dBFS** (so they don't clip on top of the music bed).

| Key | Trigger | Suggested feel | Length |
|---|---|---|---|
| `spinStart` | SPIN button pressed | Mechanical clack + rising whir | 0.3 s |
| `reelStop0` | First reel locks | Hard chunk + faint echo | 0.2 s |
| `reelStop1` | Second reel locks | Same chunk, slightly higher pitch | 0.2 s |
| `reelStop2` | Third reel locks | Same chunk, highest pitch | 0.2 s |
| `coinSmall` | Win < 100 CR | Single coin chime | 0.4 s |
| `coinMedium` | Win 100–499 CR | 3-coin cascade | 0.6 s |
| `coinLarge` | Win 500–1999 CR | Coin shower with sparkle | 1.0 s |
| `jackpot` | Win ≥ 2000 CR or triple ★ | Big synth chord + coin rain + bass drop | 2.0 s |
| `pvpIncoming` | Incoming attack/raid event banner | Tense low pulse, two beats | 0.8 s |
| `buildStart` | Building upgrade kicks off | Construction beep + low rumble | 0.5 s |
| `buildComplete` | Build job finishes | Bright completion chime | 0.6 s |
| `radarScan` | RADAR (Wire) scans for targets | Soft sonar ping | 0.4 s |
| `levelUp` | Player level increases | Ascending arpeggio | 1.2 s |
| `buttonTap` | Generic UI tap | Subtle click | 0.08 s |

Sources: freesound.org, ZapSplat (royalty-free with attribution), or commission a short sound pack on Fiverr ($30–60 for 14 SFX in this style).

After adding, update `src/services/SoundService.ts` ASSET_MAP:
```ts
const ASSET_MAP: Record<SoundKey, number | null> = {
  spinStart: require('../../assets/sounds/spin-start.mp3'),
  // …
};
```

---

## Images — `assets/images/` (have 4, may want 6+ more)

Currently shipped:
- `icon.png` — 1024×1024, app icon ✓
- `adaptive-icon.png` — 1024×1024, Android foreground ✓
- `splash.png` — 1242×2436 recommended, splash screen ✓
- `favicon.png` — 48×48, web ✓

Recommended additions (the UI currently uses text glyphs / procedurally drawn shapes — these are optional polish):

| File | Size | Used for |
|---|---|---|
| `assets/images/symbols/fuel.png` | 128×128 | Replace `⚡` glyph in reels and OC button |
| `assets/images/symbols/beam.png` | 128×128 | Replace `◈` (extraction) |
| `assets/images/symbols/shield.png` | 128×128 | Replace shield glyph |
| `assets/images/symbols/cr-small.png` | 128×128 | Replace `●` |
| `assets/images/symbols/cr-medium.png` | 128×128 | Replace `●●` |
| `assets/images/symbols/cr-large.png` | 128×128 | Replace `★` |
| `assets/images/buildings/generator.png` | 256×256 | OutpostMap node icon |
| `assets/images/buildings/armory.png` | 256×256 | OutpostMap node icon |
| `assets/images/buildings/vault.png` | 256×256 | OutpostMap node icon |
| `assets/images/buildings/turret.png` | 256×256 | OutpostMap node icon |
| `assets/images/buildings/hangar.png` | 256×256 | OutpostMap node icon |
| `assets/images/buildings/barracks.png` | 256×256 | OutpostMap node icon |
| `assets/images/bg-frontier.png` | 1080×1920 | Default Spin screen ambient background |
| `assets/images/bg-rift.png` | 1080×1920 | Rift cosmetic |
| `assets/images/bg-station.png` | 1080×1920 | Station cosmetic |

Format: **PNG with transparency** for symbols/buildings (8-bit indexed if palette is small to keep file size down), **JPG or WebP** for backgrounds (target ≤200 KB each).

---

## Fonts — `assets/fonts/` (currently using SpaceMono)

`src/constants/theme.ts` declares `fontFamily: 'SpaceMono'`. Confirm that font is registered via `expo-font` in `app/_layout.tsx`. If you want a more "frontier" feel, candidates worth auditioning:
- **Major Mono Display** (Google Fonts, free) — geometric, on-aesthetic
- **Orbitron** (Google Fonts, free) — sci-fi staple
- **JetBrains Mono** (free) — readable mono with good number alignment

---

## Out of scope but worth thinking about

- **Pilot avatar accessories** — currently 4 (visor, helmet, badge, crown) procedurally drawn. Could be replaced with PNG overlays per accessory.
- **Slot machine "frame" art** — the reel display is built from React Native views. Adding an animated PNG bezel around it would give the game its "signature" look.
- **App store screenshots & feature graphic** — needed for Play Store listing. 8 × 1080×1920 screenshots + 1024×500 feature graphic. Not technically an in-app asset but blocks submission.
