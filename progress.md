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
- [ ] **Project Init:** Stand up React Native + Expo Router with Zustand.
- [ ] **The Generator (`SlotsEngine`):** Build mathematical weighting for slot reels (Credits, Attacks, Raids, Shields).
- [ ] **State Sync:** Hook up Firebase/Firestore for real-time state and Authentication.
- [ ] **The Meta (`HabitatBuilder`):** Basic sci-fi base construction logic using earned Credits.

### Phase 2: Strategic Systems (Planned 📅)
*The mechanics that disrupt the traditional "Coin Master" model.*
- [ ] **Space Anomalies:** Implement global 4-hour weather events syncing buffs/debuffs across all players.
- [ ] **Temporal Rifts:** Build the UI/logic allowing players to spend Credits to shift reel probability weights.
- [ ] **Drone Mercenaries:** Add resource-based robotic defenders/attackers to the player's inventory.

### Phase 3: Monetization & Polish (Backlog 📋)
*Making it profitable and pretty.*
- [ ] **RevenueCat Integration:** Setup IAP for Spin Packs and Shield Bundles.
- [ ] **AdMob Integration:** Implement Rewarded Video (e.g., "Watch to reboot Temporal Rift").
- [ ] **UI/UX Polish:** Finalize gradient rendering, screen-shake effects, and the Armadillo sprite customization menus.

---

## 📝 Developer Notes & Rules of Thumb
* **Flat UI:** Minimize menu drill-downs. "Spin" is the single-button entry point.
* **Inflation Check:** Adding new currencies (Drone Fuel, Temporal Energy) must not devalue the core Credit economy. 
* **Server Authority:** Never trust the client. All spin resolutions and PvP outcomes must be validated server-side to prevent spoofing.
