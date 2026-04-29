# 🚀 Sovereign Slots: Progress & Roadmap

**Status:** Phase 1 (Foundation)  
**Last Updated:** [Insert Date]  
**Lead Architect:** Ashton  

---

## 🎯 Design Pillars
* **The Protagonist:** A rugged, customizable Armadillo in a high-tech environmental suit. 
* **The Vibe:** "Cozy Punk" — low-fi space station meets vibrant sunset. Dark mode backgrounds, orange-to-purple neon gradients, and thin, geometric sans-serif typography. Keep it lean, minimalist, and uncluttered.
* **The Hook:** Active strategy over passive RNG. Players use tactics to manipulate the slot engine and defend their habitats.

---

## 🛠️ Core Systems Tracker

### Phase 1: Engine Foundation (In Progress ⏳)
*The absolute basics to get the slot engine and client/server syncing.*
- [x] **Project Init:** Stand up React Native + Expo Router with Zustand.
- [x] **The Generator (`SlotsEngine`):** Build mathematical weighting for slot reels (Credits, Attacks, Raids, Shields).
- [x] **State Sync:** Hook up Firebase/Firestore for real-time state and Authentication.
- [x] **The Meta (`HabitatBuilder`):** Real-time build timers (30s → 72h), all 5 buildings, builder-busy lock, Firestore persistence.
- [x] **Pilot Profile:** First-launch username modal, Pilot tab with avatar/XP bar, rename flow.
- [ ] **Spin Energy Timer:** Drip-refill at 1 spin per 5 min (max 50). Live "next spin" and "full in" countdown on Spin screen.

### Phase 2: Strategic Systems (Complete ✅)
*The mechanics that disrupt the traditional "Coin Master" model.*
- [x] **Space Anomalies:** Global 4-hour weather events syncing buffs/debuffs across all players.
- [x] **Temporal Rifts:** Spend Credits to shift reel probability weights. Full RIFT tab UI.
- [x] **Drone Mercenaries:** Resource-based robotic defenders/attackers with stacking effects.

### Phase 3: Monetization & Polish (Backlog 📋)
*Making it profitable and pretty.*
- [ ] **RevenueCat Integration:** Setup IAP for Spin Packs and Shield Bundles.
- [ ] **AdMob Integration:** Implement Rewarded Video (e.g., "Watch to reboot Temporal Rift").
- [ ] **UI/UX Polish:** Finalize gradient rendering, screen-shake effects, and the Armadillo sprite customization menus.
- [ ] **Tutorial:** First-run onboarding flow — walk new players through spinning, building, and deploying their first drone.
- [ ] **Visual Sugar:** Juice up the experience — particle effects on jackpots, screen shake on attacks, animated reel symbols, haptic feedback, and transition polish.
- [ ] **Testing:** Unit tests for SlotsEngine (payout math, weight normalization, Rift modifiers) and DroneMercenaryService (effect aggregation, cost validation). Integration tests for Zustand store actions.

---

## 🔧 Environment & Tooling

### Claude Code — GitHub App Setup
The Claude Code terminal provides a `/install-github-app` command to connect the GitHub integration automatically. If that command fails, you can perform a manual setup:
1. Go to **[github.com/apps/claude](https://github.com/apps/claude)** and click **Install**.
2. Grant it access to this repository (or all repositories).
3. Once installed, it will appear under **github.com → Settings → Installed GitHub Apps** and the Claude Code terminal will have push/PR access automatically.

---

## 📝 Developer Notes & Rules of Thumb
* **Flat UI:** Minimize menu drill-downs. "Spin" is the single-button entry point.
* **Inflation Check:** Adding new currencies (Drone Fuel, Temporal Energy) must not devalue the core Credit economy. 
* **Server Authority:** Never trust the client. All spin resolutions and PvP outcomes must be validated server-side to prevent spoofing.
