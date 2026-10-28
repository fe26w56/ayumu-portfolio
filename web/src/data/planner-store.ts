import fixture from "./demo-planner.json";
import { isPlannerState, type PlannerState } from "./model";
import { createDemoStore } from "./demo-store";
export const plannerStateStore = createDemoStore(fixture as PlannerState, isPlannerState);
