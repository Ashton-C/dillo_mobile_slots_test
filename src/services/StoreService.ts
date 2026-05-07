import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PackReward {
  credits?: number;
  fuel?: number;
  boost?: number;
  shields?: number;
  spinRefill?: boolean;
}

export interface StorePack {
  id: string;
  category: 'CREDITS' | 'BUNDLE' | 'RESOURCE' | 'SPINS';
  label: string;
  description: string;
  price: string;
  rewards: PackReward;
  featured?: boolean;
}

export interface AdReward {
  id: string;
  label: string;
  rewardLabel: string;
  cooldownMs: number;
  reward: PackReward;
}

export const PACKS: StorePack[] = [
  // Credits
  { id: 'cr_pocket',  category: 'CREDITS', label: 'POCKET',     description: '1,000 credits',   price: '$0.99',  rewards: { credits: 1_000 } },
  { id: 'cr_hoard',   category: 'CREDITS', label: 'HOARD',      description: '5,000 credits',   price: '$4.99',  rewards: { credits: 5_000 } },
  { id: 'cr_vault',   category: 'CREDITS', label: 'VAULT',      description: '25,000 credits',  price: '$19.99', rewards: { credits: 25_000 }, featured: true },
  { id: 'cr_forge',   category: 'CREDITS', label: 'STAR FORGE', description: '100,000 credits', price: '$49.99', rewards: { credits: 100_000 } },

  // Spin packs
  { id: 'sp_refill',  category: 'SPINS',   label: 'SPIN REFILL', description: 'Top up to 50 spins instantly', price: '$0.99', rewards: { spinRefill: true } },

  // Resource packs
  { id: 'rs_fuel5',   category: 'RESOURCE', label: 'FUEL TANK',   description: '+5 fuel cells',     price: '$1.99', rewards: { fuel: 5 } },
  { id: 'rs_boost5',  category: 'RESOURCE', label: 'SIGNAL ARRAY', description: '+5 signal boosters', price: '$1.99', rewards: { boost: 5 } },
  { id: 'rs_shield5', category: 'RESOURCE', label: 'BARRIER PACK', description: '+5 shields',         price: '$1.99', rewards: { shields: 5 } },

  // Bundles
  { id: 'bd_starter', category: 'BUNDLE',  label: 'COMMANDER PACK', description: 'Spin refill + 2,500 CR + 3 fuel', price: '$4.99',  rewards: { spinRefill: true, credits: 2_500, fuel: 3 }, featured: true },
  { id: 'bd_war',     category: 'BUNDLE',  label: 'WAR CHEST',      description: '5 fuel + 5 boost + 5 shields',     price: '$9.99',  rewards: { fuel: 5, boost: 5, shields: 5 } },
];

export const AD_REWARDS: AdReward[] = [
  { id: 'ad_spins',  label: 'REFILL SPINS',       rewardLabel: 'spin tank refilled', cooldownMs:  5 * 60_000, reward: { spinRefill: true } },
  { id: 'ad_credits',label: '+500 CR',            rewardLabel: '+500 credits', cooldownMs: 15 * 60_000, reward: { credits: 500 } },
  { id: 'ad_fuel',   label: '+1 FUEL',            rewardLabel: '+1 fuel cell', cooldownMs: 10 * 60_000, reward: { fuel: 1 } },
  { id: 'ad_boost',  label: '+1 SIGNAL BOOSTER',  rewardLabel: '+1 boost',     cooldownMs: 10 * 60_000, reward: { boost: 1 } },
];

const cooldownKey = (id: string) => `adCooldown:${id}`;

export async function getAdReadyAt(id: string): Promise<number> {
  const raw = await AsyncStorage.getItem(cooldownKey(id));
  return raw ? parseInt(raw, 10) : 0;
}

export async function markAdClaimed(id: string, cooldownMs: number): Promise<void> {
  const readyAt = Date.now() + cooldownMs;
  await AsyncStorage.setItem(cooldownKey(id), String(readyAt));
}
