# Project Blueprint: "Sovereign Slots" (Working Title)

## 1. Vision & Core Philosophy
A disruptive, "cozy sci-fi" social-casino mobile game that evolves the "Coin Master" model. We are moving from **passive, victim-based RNG** to **active, strategy-based manipulation**. Our goal is high-LTV through "mid-core" mechanics wrapped in a minimalist, neon-dusted aesthetic.

## 2. Technical Stack
* **Frontend:** React Native + Expo (using Expo Router for file-based routing) + TypeScript.
* **Backend:** Node.js + Firebase (Firestore for real-time state, Authentication).
* **Monetization:** RevenueCat (IAP) + AdMob (Rewarded Video).
* **State Management:** Zustand (for lean, global client state) + React Query (for server state syncing) + Zod (for schema validation).

## 3. The Core Loop (The "Twist")
1.  **Spin (Generator):** Weighted slot reels for Credits (Coins), Attacks, Raids, Shields.
2.  **Build (Meta):** Sci-fi habitat/outpost construction.
3.  **Strategy (The Innovation):**
    * **Temporal Rifts:** Spend Credits to weight reel outcomes (Gambling Strategy).
    * **Space Anomalies:** Global 4-hour weather events syncing buffs/debuffs across all players.
    * **Mercenary Contracts:** Resource-based robotic drone defense/offense boosts.

## 4. Theming & Soul
* **Protagonist:** The default player character is a customizable **Armadillo** in a high-tech environmental suit.
* **Aesthetic:** Cozy Sci-fi. Think "low-fi space station meets vibrant sunset."
* **Palette:** Orange-to-purple gradients (neon horizons) and dark mode backgrounds. 
* **Typography:** Thin, geometric sans-serif fonts.

## 5. Development Constraints & Standards
* **UX/UI:** Flat hierarchy, swipable screens. "Spin" is the single-button entry point. Minimize menu drill-downs.
* **Code Quality:** Highly modular TypeScript. Every major system (Slots, Weather, Mercenary) must have a dedicated Service class.
* **Real-time:** Use Firestore `onSnapshot` for immediate attack/raid notifications and "screen shake" events.
* **Scalability:** Separate local UI state from server-side "Source of Truth" to prevent client-side spoofing/cheating.

## 6. Roadmap
### Phase 1: Engine Foundation
- [ ] Initialize Expo project with Expo Router and Zustand.
- [ ] Implement `SlotsEngine` with mathematical weighting logic.
- [ ] Establish Firebase data models (`User`, `Habitat`).

### Phase 2: Strategic Systems
- [ ] Implement `AnomalyService` (Space Weather sync).
- [ ] Build `DroneMercenary` inventory and effect system.
- [ ] Develop `TemporalRift` modifier logic for reels.

### Phase 3: Monetization & Polish
- [ ] Integrate RevenueCat (Spin Packs, Shield Bundles).
- [ ] Integrate AdMob (Watch to refill spins).
- [ ] Polish UI (Orange-to-Purple gradients, thin sans-serif font, Armadillo sprite integration).

---

## Instructions for AI
1. **Always prioritize user agency.** If a mechanic feels like it's taking control away from the player, suggest a way to mitigate it.
2. **Think about inflation.** Always consider how adding a new currency (like Drone Fuel) affects the core Credit economy.
3. **Keep it "Cozy Punk."** Every UI element should be lean and adhere to the sci-fi aesthetic. If a screen can be combined or simplified, do it. Do not over-engineer the UI components.
