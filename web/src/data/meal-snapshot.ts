import type { Recipe, Nutrition } from './model';
export function scaledRecipeNutrition(recipe: Recipe, portion: number): Nutrition {
  return Object.fromEntries(Object.entries(recipe.nutrition).map(([key,value])=>[key,Math.round(value*portion)])) as Nutrition;
}
