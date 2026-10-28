import fixture from "./demo-move.json";
import { isMoveState, type MoveState } from "./move-model";
import { createDemoStore } from "./demo-store";
export const moveStateStore = createDemoStore(fixture as MoveState, isMoveState);
