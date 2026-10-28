import { test, expect } from '@playwright/test';
import { mealMetricsForDates } from '../web/src/data/meal-summary';
import { createDemoStore } from '../web/src/data/demo-store';
import { isPlannerState, type PlannerState, type Recipe } from '../shared/planner-model';
import { isHealthState } from '../web/src/data/health-model';
import { isMoveState } from '../shared/move-model';
import plannerFixture from '../web/src/data/demo-planner.json' with { type: 'json' };
import healthFixture from '../web/src/data/demo-health.json' with { type: 'json' };
import moveFixture from '../web/src/data/demo-move.json' with { type: 'json' };
import recipes from '../web/src/data/recipes.json' with { type: 'json' };

const date = '2030-04-11';
const recipeMap = new Map((recipes as Recipe[]).map(r => [r.id, r]));
const seed = () => structuredClone(plannerFixture) as PlannerState;

test('public fixtures satisfy production runtime contracts', () => {
  expect(isPlannerState(plannerFixture)).toBe(true);
  expect(isHealthState(healthFixture)).toBe(true);
  expect(isMoveState(moveFixture)).toBe(true);
  expect(healthFixture.healthChecks).toEqual([]);
  expect(healthFixture.reports).toEqual([]);
});

test('actual replaces its plan without double counting; skipped is zero', () => {
  const state = seed();
  const before = mealMetricsForDates([date], state, recipeMap)[0];
  expect(before).toEqual({date, actual:450, planned:1240, protein:74});
  const plan = state.plans.find(p => p.date===date && p.slot==='lunch')!;
  state.actuals.push({id:'test-actual',planId:plan.id,date,slot:plan.slot,recipeId:plan.recipeId,calories:500,protein:20,recordedAt:'2030-04-11T12:00:00+09:00'});
  expect(mealMetricsForDates([date],state,recipeMap)[0]).toEqual({date,actual:950,planned:580,protein:70});
  state.actuals.at(-1)!.skipped = true;
  expect(mealMetricsForDates([date],state,recipeMap)[0]).toEqual({date,actual:450,planned:580,protein:50});
});

test('session store rejects invalid state and isolates seed and read copies', () => {
  const input = seed(); const store = createDemoStore(input,isPlannerState);
  input.plans.length=0;
  expect(store.load().plans.length).toBe(21);
  const read=store.load();read.plans.length=0;
  expect(store.load().plans.length).toBe(21);
  expect(()=>store.save({...seed(),version:9} as unknown as PlannerState)).toThrow('Invalid demo state');
  store.save(read); expect(store.load().plans).toEqual([]);
  store.reset(); expect(store.load().plans.length).toBe(21);
});
