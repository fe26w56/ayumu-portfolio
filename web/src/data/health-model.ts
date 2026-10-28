import { validHealth } from "./state-validation";
export const HEALTH_SCHEMA_VERSION = 1 as const;

export type HealthMetricKey = "sleep" | "recovery" | "circulation" | "activity";
export type HealthScoreSource = "ultrahuman" | "derived";

export type HealthMetricScore = {
  key: HealthMetricKey;
  label: string;
  value?: number;
  delta?: number;
  source: HealthScoreSource;
  detail: string;
};

export type DailyHealthSummary = {
  date: string;
  bodyScore?: number;
  status?: string;
  sleepMinutes?: number;
  sleepNeedMinutes?: number;
  sleepEfficiency?: number;
  timeInBedMinutes?: number;
  sleepStart?: string;
  sleepEnd?: string;
  sleepFinalized?: boolean;
  sleepStages?: {
    deepMinutes?: number;
    remMinutes?: number;
    lightMinutes?: number;
    awakeMinutes?: number;
    awakeEstimated?: boolean;
  };
  restingHeartRate?: number;
  hrv?: number;
  spo2?: number;
  skinTemperatureCelsius?: number;
  temperatureDeviation?: number;
  vo2Max?: number;
  steps?: number;
  scores: HealthMetricScore[];
  syncedAt?: string;
};

export type ExerciseRecord = {
  id: string;
  date: string;
  startAt?: string;
  durationMinutes?: number;
  averageHeartRate?: number;
  activeCalories?: number;
  type?: string;
  bodyArea?: string;
  intensity?: "low" | "moderate" | "high";
  source: "ultrahuman" | "manual" | "merged";
  linkedRecordIds?: string[];
};

export type HealthLabCategory = "basic" | "metabolic" | "liver" | "other";

export type HealthLabValue = {
  id: string;
  category: HealthLabCategory;
  label: string;
  value: number | string;
  valueType?: "numeric" | "qualitative" | "text";
  metricCode?: string;
  flag?: "high" | "low" | "abnormal" | "normal" | "unknown";
  unit?: string;
  referenceLabel: string;
  previousValue?: number;
  attention?: boolean;
};

export type HealthCheck = {
  id: string;
  date: string;
  facility?: string;
  importRequestId?: string;
  overallGrade?: string;
  categoryGrades?: Record<string, string>;
  findings?: string[];
  values: HealthLabValue[];
};

export type HealthReport = {
  id: string;
  kind: "daily" | "weekly" | "health-check";
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  title: string;
  summary: string;
  observations: string[];
  healthCheckId?: string;
  inputRevision?: string;
  source?: "source-document" | "app-analysis";
};

export type HealthState = {
  version: typeof HEALTH_SCHEMA_VERSION;
  sleepTargetMinutes: number;
  daily: DailyHealthSummary[];
  exercises: ExerciseRecord[];
  healthChecks: HealthCheck[];
  reports: HealthReport[];
  ultrahumanBackfillCompletedAt?: string;
  ultrahumanTemperatureBackfillCompletedAt?: string;
  ultrahumanExerciseBackfillCompletedAt?: string;
};

export function createInitialHealthState(): HealthState {
  return { version: HEALTH_SCHEMA_VERSION, sleepTargetMinutes: 480, daily: [], exercises: [], healthChecks: [], reports: [] };
}

export function isHealthState(value: unknown): value is HealthState {
  return validHealth(value);
}

function todayString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isCompletedSleep(day: DailyHealthSummary, today = todayString()) {
  if (day.sleepMinutes == null || day.sleepMinutes <= 0 || day.sleepFinalized === false) return false;
  if (day.sleepFinalized === true || day.date < today) return true;
  // Legacy records do not have a completion flag. Avoid treating a short,
  // same-day partial sync as a completed night.
  return day.sleepMinutes >= 180;
}

export function completedSleepSummaries(dailySummaries: DailyHealthSummary[], today = todayString()) {
  return dailySummaries
    .filter((day) => isCompletedSleep(day, today))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

function personalizedSleepNeed(prior: DailyHealthSummary[]) {
  const values = prior
    .slice(-28)
    .flatMap((day) => day.sleepMinutes == null ? [] : [day.sleepMinutes])
    .sort((a, b) => a - b);
  if (values.length < 14) return 480;
  const trim = Math.max(1, Math.floor(values.length * .1));
  const trimmed = values.slice(trim, values.length - trim);
  const average = trimmed.reduce((sum, value) => sum + value, 0) / Math.max(1, trimmed.length);
  return Math.round(Math.max(420, Math.min(540, average)));
}

export function sleepNeedMinutes(dailySummaries: DailyHealthSummary[], day: DailyHealthSummary) {
  const completed = completedSleepSummaries(dailySummaries, "9999-12-31");
  return personalizedSleepNeed(completed.filter((item) => item.date < day.date));
}

export function sleepDebtMinutes(dailySummaries: DailyHealthSummary[], days = 28, today = todayString()) {
  const completed = completedSleepSummaries(dailySummaries, today);
  const window = completed.slice(-days);
  let balance = 0;
  for (const day of window) {
    const need = personalizedSleepNeed(completed.filter((item) => item.date < day.date));
    const difference = need - (day.sleepMinutes ?? need);
    balance = difference >= 0
      ? balance + difference
      : Math.max(0, balance - Math.min(60, Math.abs(difference)));
  }
  return Math.round(balance);
}

function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

export function deriveCirculationScore(dailySummaries: DailyHealthSummary[]): HealthMetricScore | null {
  const usable = dailySummaries.filter((day) => day.restingHeartRate != null && day.hrv != null).slice(-29);
  if (usable.length < 8) return null;
  const current = usable.at(-1)!;
  const baseline = usable.slice(0, -1).slice(-28);
  const baselineRhr = average(baseline.map((day) => day.restingHeartRate!));
  const baselineHrv = average(baseline.map((day) => day.hrv!));
  let score = 75 + ((current.hrv! / baselineHrv) - 1) * 35 + ((baselineRhr / current.restingHeartRate!) - 1) * 30;
  if (current.spo2 != null && current.spo2 < 95) score -= Math.min(12, (95 - current.spo2) * 4);
  if (current.temperatureDeviation != null && Math.abs(current.temperatureDeviation) > .5) score -= Math.min(10, Math.abs(current.temperatureDeviation) * 8);
  const value = Math.max(0, Math.min(100, Math.round(score)));
  return { key: "circulation", label: "循環", value, source: "derived", detail: `安静時心拍 ${Math.round(current.restingHeartRate!)} bpm・HRV ${Math.round(current.hrv!)} ms` };
}

export function mergeExerciseRecords(records: ExerciseRecord[]) {
  const remaining = [...records];
  const merged: ExerciseRecord[] = [];
  while (remaining.length) {
    const record = remaining.shift()!;
    const matchIndex = remaining.findIndex((candidate) => candidate.date === record.date && candidate.startAt === record.startAt && candidate.source !== record.source);
    if (matchIndex < 0) {
      merged.push(record);
      continue;
    }
    const match = remaining.splice(matchIndex, 1)[0];
    const ring = record.source === "ultrahuman" ? record : match;
    const manual = record.source === "manual" ? record : match;
    merged.push({ ...ring, ...manual, id: `merged-${record.id}-${match.id}`, source: "merged", activeCalories: ring.activeCalories, averageHeartRate: ring.averageHeartRate, durationMinutes: ring.durationMinutes, linkedRecordIds: [record.id, match.id] });
  }
  return merged;
}
