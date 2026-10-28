import { CONDITION_SCORE_KEYS, type ConditionScoreKey, type ConditionSphereData, type MembraneOptions, type MembraneVisualState, type MetricAccentVector, type MetricVector, type Rgb } from "./types";

const SCORE_WEIGHTS: Record<ConditionScoreKey, number> = {
  sleep: 0.35,
  recovery: 0.25,
  activity: 0.22,
  circulation: 0.18,
};

// Stable semantic hues from the approved vitality proposal. Score controls how
// much of each hue is allowed through; low scores lose colour rather than turn
// into a judgemental red/green status signal.
const METRIC_ACCENTS: Record<ConditionScoreKey, Rgb> = {
  sleep: [0.47, 0.39, 0.9],
  recovery: [0.18, 0.78, 0.75],
  activity: [0.91, 0.5, 0.31],
  circulation: [0.82, 0.32, 0.63],
};

const METRIC_ACCENT_VECTOR: MetricAccentVector = [
  METRIC_ACCENTS.sleep,
  METRIC_ACCENTS.recovery,
  METRIC_ACCENTS.activity,
  METRIC_ACCENTS.circulation,
];

const NEUTRAL_ACCENT: Rgb = [0.82, 0.82, 0.82];
const DEFAULT_SCALE = 0.48;

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function finiteOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampScore(value: unknown) {
  return Math.max(0, Math.min(100, finiteOr(value, 0)));
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = clamp01(amount);
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function weightedAccent(scores: ConditionSphereData["scores"], completeness: number): Rgb {
  let totalWeight = 0;
  let red = 0;
  let green = 0;
  let blue = 0;

  for (const key of CONDITION_SCORE_KEYS) {
    const raw = scores[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const score = clampScore(raw) / 100;
    const weight = SCORE_WEIGHTS[key] * (0.4 + score * 0.6);
    const accent = METRIC_ACCENTS[key];
    totalWeight += weight;
    red += accent[0] * weight;
    green += accent[1] * weight;
    blue += accent[2] * weight;
  }

  if (totalWeight === 0) return NEUTRAL_ACCENT;
  // Incomplete data should become more neutral rather than implying a score
  // for metrics that were not supplied.
  return mix(NEUTRAL_ACCENT, [red / totalWeight, green / totalWeight, blue / totalWeight], completeness * 0.9);
}

/**
 * Convert condition data into stable, bounded visual controls.
 *
 * The mapping is intentionally fixed and non-medical: scores alter a quiet
 * visual texture only. Missing values are excluded from the weighted average;
 * completeness is independently used to reduce colour and motion confidence.
 */
export function mapConditionToMembrane({ scores, dataCompleteness }: ConditionSphereData): MembraneVisualState {
  const supplied = CONDITION_SCORE_KEYS.filter((key) => typeof scores[key] === "number" && Number.isFinite(scores[key]));
  const completeness = clamp01(finiteOr(dataCompleteness, supplied.length / CONDITION_SCORE_KEYS.length));
  const metricScore = (key: ConditionScoreKey) => {
    const raw = scores[key];
    // 0.5 is a neutral shader input. Completeness remains the source of truth
    // for whether this value is allowed to affect the visual state, so a
    // missing metric can never look like an actual zero score.
    return typeof raw === "number" && Number.isFinite(raw) ? clampScore(raw) / 100 : 0.5;
  };
  const metricPresence = (key: ConditionScoreKey) => {
    const raw = scores[key];
    return typeof raw === "number" && Number.isFinite(raw) ? completeness : 0;
  };
  const metricScores: MetricVector = [metricScore("sleep"), metricScore("recovery"), metricScore("activity"), metricScore("circulation")];
  const metricCompleteness: MetricVector = [metricPresence("sleep"), metricPresence("recovery"), metricPresence("activity"), metricPresence("circulation")];

  let totalWeight = 0;
  let weightedScore = 0;
  for (const key of CONDITION_SCORE_KEYS) {
    const raw = scores[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const weight = SCORE_WEIGHTS[key];
    totalWeight += weight;
    weightedScore += clampScore(raw) * weight;
  }

  const score = totalWeight > 0 ? weightedScore / totalWeight : 50;
  const quality = score / 100;

  // Lower quality creates a little more surface movement; incomplete data
  // slows the animation and desaturates it so unknown is never shown as bad.
  const intensity = 0.66 + quality * 0.62 + completeness * 0.2;
  const deformation = 0.5 + (1 - quality) * 0.72 + (1 - completeness) * 0.18;
  const speed = (0.36 + quality * 0.62) * (0.64 + completeness * 0.36);
  // Colour is available to the shader, but its threshold mapping keeps scores
  // below 28 nearly neutral and restores it progressively through 78.
  const accentStrength = 0.28 + completeness * 0.58;

  return {
    score,
    dataCompleteness: completeness,
    intensity: Math.max(0.45, Math.min(1.65, intensity)),
    deformation: Math.max(0.4, Math.min(1.45, deformation)),
    speed: Math.max(0.25, Math.min(1.05, speed)),
    scale: DEFAULT_SCALE,
    accent: weightedAccent(scores, completeness),
    accentStrength,
    metricScores,
    metricCompleteness,
    metricAccents: METRIC_ACCENT_VECTOR,
  };
}

export function membraneOptionsFromCondition(data: ConditionSphereData, paused = false): MembraneOptions {
  const visual = mapConditionToMembrane(data);
  return {
    speed: visual.speed,
    intensity: visual.intensity,
    deformation: visual.deformation,
    scale: visual.scale,
    accent: visual.accent,
    accentStrength: visual.accentStrength,
    metricScores: visual.metricScores,
    metricCompleteness: visual.metricCompleteness,
    metricAccents: visual.metricAccents,
    paused,
  };
}
