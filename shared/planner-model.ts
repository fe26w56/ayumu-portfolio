import { validPlanner } from "./state-validation";
export const PLANNER_SCHEMA_VERSION = 1 as const;

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type Nutrition = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
};

export type Recipe = {
  id: string;
  name: string;
  category: string;
  mealSlots: MealSlot[];
  servings: number;
  prepMinutes: number;
  satiety?: number;
  tags: string[];
  nutrition: Nutrition;
  ingredients: string[];
  steps: string[];
};

export type Plan = {
  id: string;
  date: string;
  slot: MealSlot;
  recipeId: string;
  order: number;
  fixed?: boolean;
  portion?: number;
};

export type Actual = {
  id: string;
  planId?: string;
  review?: {reason:"duplicate-plan-link";planId:string};
  date: string;
  slot: MealSlot;
  recipeId: string;
  calories: number;
  protein: number;
  recordedAt: string;
  portion?: number;
  nutrition?: Nutrition;
  recipeSnapshot?: { name: string };
  skipped?: boolean;
  edited?: boolean;
};

export type PlannerState = {
  version: typeof PLANNER_SCHEMA_VERSION;
  dailyTargets: {
    calories: number;
    protein: number;
  };
  weekTargetCalories: number;
  plans: Plan[];
  actuals: Actual[];
  customRecipes: Recipe[];
};

export function clonePlannerState(state: PlannerState): PlannerState {
  return JSON.parse(JSON.stringify(state)) as PlannerState;
}

const LEGACY_DEMO_PLAN_IDS = new Set([
  "p-mon-1", "p-mon-2", "p-mon-3",
  "p-tue-1", "p-tue-2", "p-tue-3", "p-tue-4",
  "p-wed-1", "p-wed-2",
  "p-thu-1", "p-thu-2",
  "p-fri-1", "p-fri-2",
  "p-sat-1", "p-sun-1",
]);
const LEGACY_DEMO_ACTUAL_IDS = new Set(["a-tue-1"]);

/** Removes only the records shipped with the original visual prototype. */
export function removeLegacyDemoData(state: PlannerState): PlannerState {
  const cloned = clonePlannerState(state);
  return {
    ...cloned,
    plans: cloned.plans.filter((plan) => !LEGACY_DEMO_PLAN_IDS.has(plan.id)),
    actuals: cloned.actuals.filter((actual) => !LEGACY_DEMO_ACTUAL_IDS.has(actual.id)),
  };
}

export function isPlannerState(value: unknown): value is PlannerState {
  return validPlanner(value);
}
