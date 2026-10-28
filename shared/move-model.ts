import type { StrengthWorkout } from "./strength-workout";
import { validMove } from "./state-validation";
export const MOVE_SCHEMA_VERSION = 1 as const;
export const MOVE_RECOMMENDATION_VERSION = 1 as const;

export type MoveCategory = "strength" | "walking" | "running" | "cycling" | "light" | "rest" | "other";
export type MoveIntensity = "light" | "moderate" | "hard";
export type WorkoutOutcome = "complete" | "partial" | "skipped";
export type DetectedWorkoutClassification = { suggestedPatternId?: string; confidence: "high" | "medium" | "low"; reasons: string[]; appliedAutomatically: boolean };

export type MoveExercise = {
  id: string;
  name: string;
  defaultSets?: number;
  defaultReps?: number;
  defaultWeightKg?: number;
};

export type MovePattern = {
  id: string;
  name: string;
  category: MoveCategory;
  exercises: MoveExercise[];
  defaultDurationMinutes: number;
  defaultIntensity: MoveIntensity;
  weeklyCount?: number;
  weeklyMinutes?: number;
  preferredWeekdays: number[];
  preferredTimeWindow?: "morning" | "daytime" | "evening";
  enabled: boolean;
};

export type WorkoutSet = {
  exerciseId: string;
  set: number;
  weightKg?: number;
  reps?: number;
  completed: boolean;
};

export type MoveRecord = {
  id: string;
  date: string;
  patternId?: string;
  type: string;
  startedAt?: string;
  kind?: "session" | "daily-activity";
  providerRecordId?: string;
  durationMinutes: number;
  intensity?: MoveIntensity;
  outcome: WorkoutOutcome;
  source: "manual" | "ultrahuman" | "merged" | "automatic-rest";
  sets?: WorkoutSet[];
  strengthWorkout?: StrengthWorkout;
  averageHeartRate?: number;
  activeCalories?: number;
  perceivedIntensity?: MoveIntensity;
  bodyAreaAvoided?: string;
  unwell?: boolean;
  linkedRecordIds?: string[];
  classification?: DetectedWorkoutClassification;
};

export type MoveCandidate = {
  patternId: string;
  role: "main" | "supplemental";
  durationMinutes: number;
  intensity: MoveIntensity;
  reasons: string[];
};

export type MoveRecommendation = {
  version: typeof MOVE_RECOMMENDATION_VERSION;
  id: string;
  date: string;
  generatedAt: string;
  source: "scheduled" | "deterministic";
  inputRevision: string;
  main: MoveCandidate;
  supplemental?: MoveCandidate;
  rationale?: string;
};

export type MoveState = {
  version: typeof MOVE_SCHEMA_VERSION;
  patterns: MovePattern[];
  records: MoveRecord[];
  recommendations: MoveRecommendation[];
  notificationTime: string;
};

type ImportedExerciseRecord = {
  id: string;
  date: string;
  startAt?: string;
  durationMinutes?: number;
  averageHeartRate?: number;
  activeCalories?: number;
  type?: string;
  intensity?: "low" | "moderate" | "high";
  source: "ultrahuman" | "manual" | "merged";
  linkedRecordIds?: string[];
};

export function moveRecordsForDisplay(state: MoveState, exercises: ImportedExerciseRecord[]): MoveState {
  const existingExerciseIds = new Set(state.records.flatMap((record) => record.linkedRecordIds ?? []));
  const existingUltrahumanKeys = new Set(state.records
    .filter((record) => record.source === "ultrahuman" || record.source === "merged")
    .map((record) => `${record.date}:${record.startedAt ?? ""}:${record.durationMinutes}`));
  const imported = exercises.flatMap((exercise): MoveRecord[] => {
    const durationMinutes = Math.round(exercise.durationMinutes ?? 0);
    const start = exercise.startAt ?? "";
    const startedAt = /^\d{2}:\d{2}/.test(start) ? `${exercise.date}T${start.slice(0, 5)}:00` : start || undefined;
    const duplicateKey = `${exercise.date}:${startedAt ?? ""}:${durationMinutes}`;
    if (durationMinutes <= 0 || existingExerciseIds.has(exercise.id) || existingUltrahumanKeys.has(duplicateKey)) return [];
    return [{
      id: `health-exercise:${exercise.id}`,
      kind: exercise.id.startsWith("ultrahuman-active-minutes-") ? "daily-activity" : "session",
      providerRecordId: exercise.id,
      date: exercise.date,
      type: exercise.type || (exercise.source === "ultrahuman" ? "アクティブ時間" : "運動"),
      startedAt,
      durationMinutes,
      intensity: exercise.intensity === "low" ? "light" : exercise.intensity === "high" ? "hard" : exercise.intensity,
      outcome: "complete",
      source: exercise.source,
      averageHeartRate: exercise.averageHeartRate,
      activeCalories: exercise.activeCalories,
      linkedRecordIds: [exercise.id],
    }];
  });
  return { ...state, records: [...state.records, ...imported] };
}

// Public example defaults; no personal workout weights.
export const defaultMovePatterns: MovePattern[] = [
  {
    "id": "walking",
    "name": "ウォーキング",
    "category": "walking",
    "exercises": [],
    "defaultDurationMinutes": 20,
    "defaultIntensity": "light",
    "weeklyMinutes": 100,
    "preferredWeekdays": [],
    "enabled": true
  },
  {
    "id": "light",
    "name": "ストレッチ",
    "category": "light",
    "exercises": [],
    "defaultDurationMinutes": 10,
    "defaultIntensity": "light",
    "weeklyMinutes": 30,
    "preferredWeekdays": [],
    "enabled": true
  },
  {
    "id": "rest",
    "name": "休息日",
    "category": "rest",
    "exercises": [],
    "defaultDurationMinutes": 0,
    "defaultIntensity": "light",
    "weeklyMinutes": 0,
    "preferredWeekdays": [],
    "enabled": true
  }
];

export function createInitialMoveState(): MoveState {
  return { version: MOVE_SCHEMA_VERSION, patterns: structuredClone(defaultMovePatterns), records: [], recommendations: [], notificationTime: "08:00" };
}

export function isMoveState(value: unknown): value is MoveState {
  return validMove(value);
}

export function isMoveRecommendation(value: unknown, allowed: MoveCandidate[], revision: string, date: string): value is MoveRecommendation {
  if (!value || typeof value !== "object") return false;
  const recommendation = value as Partial<MoveRecommendation>;
  const keys = new Set(allowed.map((candidate) => `${candidate.role}:${candidate.patternId}:${candidate.durationMinutes}:${candidate.intensity}`));
  if (recommendation.version !== MOVE_RECOMMENDATION_VERSION || recommendation.date !== date || recommendation.inputRevision !== revision || !recommendation.main) return false;
  if (!keys.has(`main:${recommendation.main.patternId}:${recommendation.main.durationMinutes}:${recommendation.main.intensity}`)) return false;
  return !recommendation.supplemental || keys.has(`supplemental:${recommendation.supplemental.patternId}:${recommendation.supplemental.durationMinutes}:${recommendation.supplemental.intensity}`);
}

function mondayFor(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

export function weekRecords(state: MoveState, date: string) {
  const start = mondayFor(date);
  const end = new Date(`${start}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  const endString = end.toISOString().slice(0, 10);
  return state.records.filter((record) => record.date >= start && record.date < endString && record.outcome !== "skipped");
}

export function completionCredit(record: MoveRecord) {
  return record.outcome === "complete" ? 1 : record.outcome === "partial" ? .5 : 0;
}

export function buildMoveCandidates(state: MoveState, date: string, bodyScore?: number, unwell = false): MoveCandidate[] {
  const records = weekRecords(state, date);
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const recentFeedback = state.records.filter((record) => record.date <= date && (record.unwell || record.bodyAreaAvoided)).sort((a, b) => b.date.localeCompare(a.date))[0];
  const lowReadiness = unwell || Boolean(recentFeedback?.unwell) || (bodyScore != null && bodyScore < 60);
  const enabled = state.patterns.filter((pattern) => pattern.enabled);
  const avoided = recentFeedback?.bodyAreaAvoided?.toLowerCase() ?? "";
  const excludesPattern = (pattern: MovePattern) => (pattern.id === "upper" && /上半身|肩|腕|肘/.test(avoided)) || (pattern.id === "lower" && /下半身|脚|足|ひざ|膝/.test(avoided));
  const strength = enabled.filter((pattern) => pattern.category === "strength" && !excludesPattern(pattern)).sort((a, b) => {
    const aDone = records.filter((record) => record.patternId === a.id).reduce((sum, record) => sum + completionCredit(record), 0);
    const bDone = records.filter((record) => record.patternId === b.id).reduce((sum, record) => sum + completionCredit(record), 0);
    const aGap = (a.weeklyCount ?? 0) - aDone + (a.preferredWeekdays.includes(weekday) ? .25 : 0);
    const bGap = (b.weeklyCount ?? 0) - bDone + (b.preferredWeekdays.includes(weekday) ? .25 : 0);
    return bGap - aGap;
  });
  const light = enabled.find((pattern) => pattern.category === "walking") ?? enabled.find((pattern) => pattern.category === "light");
  const rest = enabled.find((pattern) => pattern.category === "rest");
  const candidates: MoveCandidate[] = [];
  if (lowReadiness && rest) candidates.push({ patternId: rest.id, role: "main", durationMinutes: 0, intensity: "light", reasons: ["回復を優先"] });
  else {
    const mainPatterns = strength.length ? strength : enabled.filter((pattern) => !["rest", "light"].includes(pattern.category) && !excludesPattern(pattern));
    mainPatterns.forEach((pattern) => candidates.push({ patternId: pattern.id, role: "main", durationMinutes: bodyScore != null && bodyScore < 70 ? Math.max(20, pattern.defaultDurationMinutes - 10) : pattern.defaultDurationMinutes, intensity: bodyScore != null && bodyScore < 70 ? "light" : pattern.defaultIntensity, reasons: ["今週の残り目標", pattern.preferredWeekdays.includes(weekday) ? "希望曜日" : "曜日は柔軟に調整"] }));
    if (rest) candidates.push({ patternId: rest.id, role: "main", durationMinutes: 0, intensity: "light", reasons: ["休養へ変更できます"] });
  }
  const lightMinutes = light ? records.filter((record) => record.patternId === light.id).reduce((sum, record) => sum + record.durationMinutes, 0) : 0;
  if (light && lightMinutes < (light.weeklyMinutes ?? Number.POSITIVE_INFINITY)) candidates.push({ patternId: light.id, role: "supplemental", durationMinutes: light.defaultDurationMinutes, intensity: "light", reasons: ["週の活動時間を補う"] });
  return candidates;
}

export function classifyDetectedWorkout(record: MoveRecord, patterns: MovePattern[]): DetectedWorkoutClassification {
  const normalized = record.type.toLowerCase();
  const exactCategory = /run|running|ランニング|ジョギング/.test(normalized) ? "running"
    : /cycl|bike|cycling|自転車|サイクリング/.test(normalized) ? "cycling"
      : /walk|walking|ウォーキング|散歩/.test(normalized) ? "walking"
        : /strength|weight|筋トレ|筋力/.test(normalized) ? "strength" : undefined;
  const exact = exactCategory ? patterns.find((pattern) => pattern.category === exactCategory) : undefined;
  if (exact) return { suggestedPatternId: exact.id, confidence: "high", reasons: [`検出種別「${record.type}」と一致`], appliedAutomatically: true };
  const inferredCategory = (record.averageHeartRate ?? 0) >= 145 && record.durationMinutes >= 15 ? "running" : record.durationMinutes >= 15 ? "walking" : undefined;
  const inferred = inferredCategory ? patterns.find((pattern) => pattern.category === inferredCategory) : undefined;
  if (inferred) return { suggestedPatternId: inferred.id, confidence: "medium", reasons: ["時間と平均心拍から候補を提示"], appliedAutomatically: false };
  return { confidence: "low", reasons: ["分類に必要な情報が不足"], appliedAutomatically: false };
}

export function applyDetectedWorkoutClassification(record: MoveRecord, patterns: MovePattern[]): MoveRecord {
  if (record.source !== "ultrahuman" || record.classification) return record;
  const classification = classifyDetectedWorkout(record, patterns);
  const pattern = classification.appliedAutomatically ? patterns.find((item) => item.id === classification.suggestedPatternId) : undefined;
  return { ...record, patternId: pattern?.id ?? record.patternId, type: pattern?.name ?? record.type, intensity: pattern?.defaultIntensity ?? record.intensity, classification };
}

export function deterministicRecommendation(state: MoveState, date: string, revision: string, bodyScore?: number): MoveRecommendation {
  const candidates = buildMoveCandidates(state, date, bodyScore);
  const main = candidates.find((candidate) => candidate.role === "main") ?? { patternId: "rest", role: "main" as const, durationMinutes: 0, intensity: "light" as const, reasons: ["利用できるパターンがありません"] };
  return { version: MOVE_RECOMMENDATION_VERSION, id: `deterministic-${date}-${revision}`, date, generatedAt: new Date().toISOString(), source: "deterministic", inputRevision: revision, main, supplemental: candidates.find((candidate) => candidate.role === "supplemental") };
}

export function mergeDetectedWorkout(ring: MoveRecord, manual: MoveRecord): MoveRecord {
  return {
    ...manual,
    id: `merged-${manual.id}-${ring.id}`,
    source: "merged",
    durationMinutes: ring.durationMinutes || manual.durationMinutes,
    averageHeartRate: ring.averageHeartRate,
    activeCalories: ring.activeCalories,
    linkedRecordIds: [manual.id, ring.id],
  };
}

export function findDetectedWorkoutMatch(ring: MoveRecord, records: MoveRecord[]) {
  const ringStart = ring.startedAt ? Date.parse(ring.startedAt) : Number.NaN;
  const candidates = records.filter((record) => record.source === "manual" && record.date === ring.date && !record.linkedRecordIds?.length);
  return candidates
    .map((record) => {
      const manualStart = record.startedAt ? Date.parse(record.startedAt) : Number.NaN;
      const startGapMinutes = Number.isFinite(ringStart) && Number.isFinite(manualStart) ? Math.abs(ringStart - manualStart) / 60_000 : 45;
      const durationGap = Math.abs(ring.durationMinutes - record.durationMinutes) / Math.max(1, ring.durationMinutes, record.durationMinutes);
      const patternMatch = ring.patternId && record.patternId ? ring.patternId === record.patternId : false;
      const score = (patternMatch ? 3 : 0) + Math.max(0, 2 - startGapMinutes / 30) + Math.max(0, 2 - durationGap * 3);
      return { record, score, startGapMinutes, durationGap };
    })
    .filter((candidate) => candidate.startGapMinutes <= 120 && candidate.durationGap <= .75)
    .sort((a, b) => b.score - a.score)[0]?.record;
}

export function nextLoadSuggestion(record: MoveRecord) {
  if (!record.sets?.length) return undefined;
  const completed = record.sets.filter((set) => set.completed);
  const last = completed.at(-1);
  if (!last?.weightKg) return undefined;
  if (record.outcome === "complete" && record.perceivedIntensity !== "hard") return Math.round((last.weightKg + 2.5) * 2) / 2;
  if (record.outcome === "partial" || record.perceivedIntensity === "hard") return Math.max(0, Math.round((last.weightKg - 2.5) * 2) / 2);
  return last.weightKg;
}

/** A provider daily total already contains its sessions; never add them again. */
export function activityMinutes(records: MoveRecord[]): number {
  const dates=[...new Set(records.map(r=>r.date))];
  return dates.reduce((sum,date)=>{
    const day=records.filter(r=>r.date===date && r.outcome!=="skipped");
    const daily=day.filter(r=>r.kind==="daily-activity" || r.providerRecordId?.startsWith("ultrahuman-active-minutes-") || r.linkedRecordIds?.some(id=>id.startsWith("ultrahuman-active-minutes-")));
    return sum+(daily.length ? Math.max(...daily.map(r=>r.durationMinutes)) : day.reduce((total,r)=>total+r.durationMinutes,0));
  },0);
}
