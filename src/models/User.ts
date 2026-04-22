import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';

// Firestore collection: "users"
// Document ID: Firebase Auth UID

export const UserSchema = z.object({
  uid: z.string(),
  displayName: z.string().min(1).max(30),
  avatarColor: z.string().default('#FF6B35'),

  // Core resources
  credits: z.number().int().min(0).default(500),
  attacks: z.number().int().min(0).max(50).default(5),
  raids: z.number().int().min(0).max(50).default(0),
  shields: z.number().int().min(0).max(50).default(0),

  // Spin economy
  spinsRemaining: z.number().int().min(0).max(50).default(50),
  lastSpinRefillAt: z.instanceof(Timestamp).nullable().default(null),

  // Progression
  xp: z.number().int().min(0).default(0),
  level: z.number().int().min(1).default(1),

  // References
  habitatId: z.string().nullable().default(null),

  // Timestamps
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp),
});

export type User = z.infer<typeof UserSchema>;

// Partial shape used for Firestore updates — never update uid/createdAt from client
export const UserUpdateSchema = UserSchema.partial().omit({
  uid: true,
  createdAt: true,
});
export type UserUpdate = z.infer<typeof UserUpdateSchema>;

// Resource deltas applied after a spin
export const ResourceDeltaSchema = z.object({
  credits: z.number().int().default(0),
  attacks: z.number().int().default(0),
  raids: z.number().int().default(0),
  shields: z.number().int().default(0),
  spinsRemaining: z.number().int().default(-1), // -1 per spin consumed
  xp: z.number().int().default(5),              // baseline XP per spin
});
export type ResourceDelta = z.infer<typeof ResourceDeltaSchema>;

// XP required to reach the next level (linear for now; tune in Phase 3)
export function xpToNextLevel(level: number): number {
  return 100 * level;
}
