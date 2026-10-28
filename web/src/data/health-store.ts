import fixture from "./demo-health.json";
import { isHealthState, type HealthState } from "./health-model";
import { createDemoStore } from "./demo-store";
const store = createDemoStore(fixture as HealthState, isHealthState);
export const healthStateStore = { ...store, saveLatestSummary: store.save };
