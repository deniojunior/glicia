import type { GlucoseTrend } from "./models";

export interface SafetyAssessment {
  bolus_blocked: boolean;
  rapid_fall_warning: boolean;
}

export function assessBolusSafety(
  glucose: number,
  trend: GlucoseTrend,
  hypoglycemiaThreshold: number
): SafetyAssessment {
  if (!Number.isFinite(glucose) || glucose <= 0) {
    throw new Error("Glicemia deve ser um número finito maior que zero.");
  }
  if (!Number.isFinite(hypoglycemiaThreshold) || hypoglycemiaThreshold <= 0) {
    throw new Error("Limite de hipoglicemia deve ser um número finito maior que zero.");
  }

  const bolusBlocked = glucose < hypoglycemiaThreshold;
  return {
    bolus_blocked: bolusBlocked,
    rapid_fall_warning: !bolusBlocked && trend === "CAINDO_RAPIDO" && glucose < 100
  };
}
