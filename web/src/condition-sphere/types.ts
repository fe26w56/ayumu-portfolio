export const CONDITION_SCORE_KEYS = ["sleep", "recovery", "activity", "circulation"] as const;

export type ConditionScoreKey = (typeof CONDITION_SCORE_KEYS)[number];

/**
 * Scores are intentionally nullable: a missing metric should not be presented
 * as a zero or otherwise look like a negative health judgment.
 */
export type ConditionScores = Partial<Record<ConditionScoreKey, number | null | undefined>>;

export interface ConditionSphereData {
  scores: ConditionScores;
  /** A source-provided completeness value in the inclusive range 0..1. */
  dataCompleteness?: number | null;
}

export type Rgb = readonly [number, number, number];
export type MetricVector = readonly [number, number, number, number];
export type MetricAccentVector = readonly [Rgb, Rgb, Rgb, Rgb];

export interface MembraneVisualState {
  /** Weighted score used only to derive the visual state. It is not a diagnosis. */
  score: number;
  dataCompleteness: number;
  intensity: number;
  deformation: number;
  speed: number;
  scale: number;
  accent: Rgb;
  accentStrength: number;
  metricScores: MetricVector;
  metricCompleteness: MetricVector;
  metricAccents: MetricAccentVector;
}

export interface MembraneOptions {
  /** Animation rate; 1 is the reference-inspired default. */
  speed?: number;
  intensity?: number;
  deformation?: number;
  /** Sphere radius relative to the shorter canvas dimension. */
  scale?: number;
  paused?: boolean;
  accent?: Rgb;
  accentStrength?: number;
  metricScores?: MetricVector;
  metricCompleteness?: MetricVector;
  metricAccents?: MetricAccentVector;
}

export interface MembraneLifecycleOptions {
  onUnavailable?: () => void;
  onAvailable?: () => void;
}

export type MembraneControllerOptions = MembraneOptions & MembraneLifecycleOptions;

export interface MembraneSphereController {
  update(next: MembraneOptions): void;
  dispose(): void;
}

export interface MembraneSphereProps extends ConditionSphereData {
  className?: string;
  paused?: boolean;
  ariaLabel?: string;
  fallbackLabel?: string;
}
