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
2.  **Build (Meta):** Clash-style real-time base construction. Players spend Credits earned from spinning to construct and upgrade buildings inside their sci-fi outpost. Key design rules:
    * **Real-Time Build Timers:** Construction and upgrades take real wall-clock time — seconds for Level 1, scaling up to hours or days for high-tier upgrades. This is the primary long-term engagement driver.
    * **Builder Slots:** Players start with 1 active Builder (drone worker). Additional Builder slots are a premium IAP unlock, allowing parallel construction (core Clash monetization mechanic).
    * **Monetized Skip:** Players can spend a hard currency (Temporal Crystals — distinct from Credits) to instantly complete any build timer. Rewarded video ads grant small timer reductions as a soft alternative.
    * **Building Roster** (current — expand per phase):
      - `GENERATOR` — Increases passive Credit income rate
      - `ARMORY` — Raises the Attack storage cap
      - `VAULT` — Reduces Credit loss when raided
      - `TURRET` — Auto-blocks one incoming Attack per cooldown window
      - `HANGAR` — Unlocks Drone Mercenary contracts (Phase 2)
    * **Outpost Level:** The Outpost itself has a master level (like Clash's Town Hall) that gates which buildings can be built and how high they can be upgraded. Attacking a player's Outpost directly is the highest-stakes PvP action.
    * **No Instant Gratification at High Tiers:** Level 1–3 upgrades should feel snappy (under 10 minutes). Level 7–10 upgrades should feel like real commitment (12–72 hours). This creates natural IAP pressure without being predatory at the low end.
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

### Phase 1: Engine Foundation ✅
- [x] Initialize Expo project with Expo Router and Zustand.
- [x] Implement `SlotsEngine` with mathematical weighting logic.
- [x] Establish Firebase data models (`User`, `Habitat`).

### Phase 2: Strategic Systems ✅
- [x] Implement `AnomalyService` (Space Weather sync).
- [x] Build `DroneMercenary` inventory and effect system.
- [x] Develop `TemporalRift` modifier logic for reels.
- [x] Spin energy drip-refill timer (1 spin / 5 min, up to 50 max).
- [x] HabitatBuilder — real-time build timers with Firestore persistence.
- [x] Pilot profile, username setup modal, ArmadilloAvatar.
- [x] FUEL CELLS (attacks) / SIGNAL BOOSTERS (raids) — Overclock + Signal Boost spin buffs.
- [x] ModifierPanel — active effects display with dots/numbers toggle.
- [x] Brand polish — gradient header, jackpot flash, SpinButton glow pulse, low-spin warning.

### Phase 3: Social Combat & Drone Marketplace 🔨
#### Design Decisions (locked)
- **PvP mini-game:** RNG + skill. Use a slot-with-insta-stop mechanic (three mini-reels spin, player taps each to lock — on-theme with the slot machine core). Player's Outpost Level adds a flat power bonus to the final result. Highly thematic, minimal learning curve.
- **Drone UI:** Modal triggered from Habitat screen (CONTRACTS button, visible when HANGAR ≥ 1).
- **AdMob:** Deferred to Phase 4. Build social loop first.
- **Outpost Level:** Hard gate — buildings cannot be upgraded past the current Outpost level. Incentivizes Outpost upgrades and extends progression timeline naturally.

#### Items
- [x] Outpost Level System — hard gate, upgrade flow, UI on Habitat screen.
- [x] Drone Marketplace — modal with hire flow wired to game store resource deduction.
- [x] PvP Loop — INTRUSION / EXTRACTION symbols on reels, CombatMiniGame (insta-stop), EventBanner (real-time), player index writes, resource deduction on launch.
- [x] Radar screen — player discovery, 5 nearby targets, threat assessment, BREACH/EXTRACT actions.
- [x] Combat log on Pilot tab.
- [ ] Cloud Function — resolve `combatRequests`, write `users/{uid}/events`, apply VAULT/TURRET passives.
- [ ] TURRET passive — auto-block N incoming attacks per day (TURRET building level).
- [ ] VAULT passive — reduce credit loss % on raid resolution (VAULT building level).

### Phase 4: Monetization
- [ ] RevenueCat — Spin Packs, Builder Slots (parallel construction), Shield Bundles.
- [ ] AdMob rewarded ads — +5 spins, −30 min from build timer.
- [ ] Temporal Crystals hard currency — instant build skip.

---

## Instructions for AI
1. **Always prioritize user agency.** If a mechanic feels like it's taking control away from the player, suggest a way to mitigate it.
2. **Think about inflation.** Always consider how adding a new currency (like Drone Fuel) affects the core Credit economy.
3. **Keep it "Cozy Punk."** Every UI element should be lean and adhere to the sci-fi aesthetic. If a screen can be combined or simplified, do it. Do not over-engineer the UI components.
