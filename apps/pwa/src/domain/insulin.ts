import type { GlucoseTrend } from "./models";

export interface DoseCalculation {
  correction: number;
  carbohydrate_coverage: number;
  trend_adjustment: number;
  total: number;
  suggested: number;
}

const TREND_ADJUSTMENTS: Readonly<Record<GlucoseTrend, readonly [number, number, number, number]>> = {
  SUBINDO_RAPIDO: [2, 2, 1, 1],
  SUBINDO: [1, 1, 1, 0],
  ESTAVEL: [0, 0, 0, 0],
  CAINDO: [-1, -1, -1, 0],
  CAINDO_RAPIDO: [-2, -2, -1, 0],
  NAO_INFORMADA: [0, 0, 0, 0]
};

export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
}

export function trendAdjustment(trend: GlucoseTrend, correctionFactor: number): number {
  const adjustments = TREND_ADJUSTMENTS[trend];
  if (correctionFactor < 25) {
    return adjustments[0];
  }
  if (correctionFactor < 50) {
    return adjustments[1];
  }
  if (correctionFactor <= 75) {
    return adjustments[2];
  }
  return adjustments[3];
}

export interface DoseInput {
  glucose: number;
  carbohydrates: number;
  target_glucose: number;
  correction_factor: number;
  carbohydrate_ratio: number;
  trend: GlucoseTrend;
}

export function calculateSuggestedDose(input: DoseInput): DoseCalculation {
  const {
    glucose,
    carbohydrates,
    target_glucose: targetGlucose,
    correction_factor: correctionFactor,
    carbohydrate_ratio: carbohydrateRatio,
    trend
  } = input;

  if (glucose <= 0 || carbohydrates < 0) {
    throw new Error("Glicemia e carboidratos inválidos.");
  }
  if (correctionFactor <= 0 || carbohydrateRatio <= 0) {
    throw new Error("Fatores de insulina devem ser maiores que zero.");
  }

  const correction = (glucose - targetGlucose) / correctionFactor;
  const carbohydrateCoverage = carbohydrates / carbohydrateRatio;
  const adjustment = trendAdjustment(trend, correctionFactor);
  const total = correction + carbohydrateCoverage + adjustment;

  return {
    correction,
    carbohydrate_coverage: carbohydrateCoverage,
    trend_adjustment: adjustment,
    total,
    suggested: Math.max(0, roundHalfAwayFromZero(total))
  };
}
