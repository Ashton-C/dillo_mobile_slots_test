import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  COSMETICS_CATALOG,
  COSMETIC_ACTIVE_DEFAULTS,
  FREE_COSMETIC_IDS,
  BUNDLE_GRANTS,
  CosmeticCategory,
} from '@/services/CosmeticsService';
import { useGameStore } from '@/store/useGameStore';

interface CosmeticsState {
  owned: Set<string>;
  active: Record<CosmeticCategory, string>;
  loaded: boolean;

  load: () => Promise<void>;
  buy: (id: string) => 'ok' | 'insufficient_credits' | 'iap_required' | 'already_owned';
  equip: (id: string) => void;
  unequip: (category: CosmeticCategory) => void;
  isOwned: (id: string) => boolean;
  getActive: (category: CosmeticCategory) => string;
}

const STORAGE_OWNED  = 'cosmetics:owned_v1';
const STORAGE_ACTIVE = 'cosmetics:active_v1';

export const useCosmeticsStore = create<CosmeticsState>((set, get) => ({
  owned:  new Set(FREE_COSMETIC_IDS),
  active: { ...COSMETIC_ACTIVE_DEFAULTS },
  loaded: false,

  async load() {
    const [ownedRaw, activeRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_OWNED),
      AsyncStorage.getItem(STORAGE_ACTIVE),
    ]);
    const owned = new Set(FREE_COSMETIC_IDS);
    if (ownedRaw) {
      (JSON.parse(ownedRaw) as string[]).forEach((id) => owned.add(id));
    }
    const savedActive = activeRaw ? (JSON.parse(activeRaw) as Partial<Record<CosmeticCategory, string>>) : {};
    const active = { ...COSMETIC_ACTIVE_DEFAULTS, ...savedActive } as Record<CosmeticCategory, string>;

    // One-time migration: sym_dillo → sym_squad
    if (owned.has('sym_dillo')) {
      owned.delete('sym_dillo');
      owned.add('sym_squad');
    }
    if (active.SYMBOL_PACK === 'sym_dillo') {
      active.SYMBOL_PACK = 'sym_squad';
    }

    set({ owned, active, loaded: true });
  },

  buy(id) {
    if (get().isOwned(id)) return 'already_owned';
    const item = COSMETICS_CATALOG.find((c) => c.id === id);
    if (!item) return 'iap_required';
    if (item.creditCost < 0) return 'iap_required';
    if (item.creditCost === 0) {
      // Free — just grant
      const next = new Set(get().owned);
      next.add(id);
      set({ owned: next });
      _persistOwned(next);
      return 'ok';
    }
    if (!useGameStore.getState().subtractCredits(item.creditCost)) return 'insufficient_credits';

    const next = new Set(get().owned);
    next.add(id);

    // Handle bundle grants
    const bundle = BUNDLE_GRANTS[id];
    if (bundle) {
      bundle.ids.forEach((gid) => next.add(gid));
      if (bundle.bonusCredits) useGameStore.getState().addCredits(bundle.bonusCredits);
    }

    set({ owned: next });
    _persistOwned(next);
    return 'ok';
  },

  equip(id) {
    if (!get().isOwned(id)) return;
    const item = COSMETICS_CATALOG.find((c) => c.id === id);
    // Also allow equipping defaults that aren't in the catalog
    const category = item?.category;
    if (!category) return;
    const next = { ...get().active, [category]: id };
    set({ active: next });
    AsyncStorage.setItem(STORAGE_ACTIVE, JSON.stringify(next));
  },

  unequip(category) {
    const defaultId = COSMETIC_ACTIVE_DEFAULTS[category];
    const next = { ...get().active, [category]: defaultId };
    set({ active: next });
    AsyncStorage.setItem(STORAGE_ACTIVE, JSON.stringify(next));
  },

  isOwned(id) {
    return FREE_COSMETIC_IDS.has(id) || get().owned.has(id);
  },

  getActive(category) {
    return get().active[category] ?? COSMETIC_ACTIVE_DEFAULTS[category];
  },
}));

function _persistOwned(owned: Set<string>) {
  const toSave = [...owned].filter((id) => !FREE_COSMETIC_IDS.has(id));
  AsyncStorage.setItem(STORAGE_OWNED, JSON.stringify(toSave));
}
