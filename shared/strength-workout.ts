import { z } from "zod";

export const strengthWorkoutSchema = z.object({
  entries: z.array(z.object({
    exercise: z.string().trim().min(1).max(100),
    weight_kg: z.number().min(0).max(2000).nullable().optional(),
    reps: z.number().int().min(1).max(10000),
    sets: z.number().int().min(1).max(1000),
    notes: z.string().max(1000).optional(),
  })).min(1).max(100),
  notes: z.string().max(2000).optional(),
  duration_minutes: z.number().int().min(1).max(1440).optional(),
});

export type StrengthWorkout = z.infer<typeof strengthWorkoutSchema>;
export const strengthSessionIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/);
export const tokyoDateSchema = z.iso.date().describe("Asia/TokyoのYYYY-MM-DD");
