import type { PlannerState, Recipe } from "./model";
function scaledNutrition(recipe: Recipe, portion = 1) { return { calories: recipe.nutrition.calories * portion, protein: recipe.nutrition.protein * portion }; }
export type DayMetric = { date: string; actual: number; planned: number; protein: number };
export function mealMetricsForDates(dates: string[], planner: PlannerState, recipesById: Map<string, Recipe>): DayMetric[] {
  return dates.map((date) => { const dayPlans = planner.plans.filter((plan) => plan.date === date); const actuals = planner.actuals.filter((actual) => actual.date === date); const actual = actuals.filter((item) => !item.skipped).reduce((sum, item) => sum + item.calories, 0); let planned = 0; let protein = actuals.filter((item) => !item.skipped).reduce((sum, item) => sum + item.protein, 0); dayPlans.forEach((plan) => { if (actuals.some((item) => item.planId === plan.id)) return; const recipe = recipesById.get(plan.recipeId); if (!recipe) return; const nutrition = scaledNutrition(recipe, plan.portion); planned += nutrition.calories; protein += nutrition.protein; }); return { date, actual, planned, protein }; });
}
