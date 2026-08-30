import {
  assessBolusSafety,
  calculateSuggestedDose,
  carbohydrateRatioFor,
  type ClinicalSettings,
  type ConversationTurn,
  type DoseCalculation,
  type SafetyAssessment
} from "../domain";

export interface MealDecision {
  safety: SafetyAssessment;
  calculation: DoseCalculation | null;
}

export function decideConfirmedMeal(turn: ConversationTurn, settings: ClinicalSettings): MealDecision {
  if (turn.glucose === null || turn.glucose_trend === null || turn.meal_type === null || turn.total_carbohydrates === null) {
    throw new Error("A refeição precisa estar completa antes da confirmação.");
  }
  const safety = assessBolusSafety(turn.glucose, turn.glucose_trend, settings.hypoglycemia_threshold);
  if (safety.bolus_blocked) return { safety, calculation: null };
  return {
    safety,
    calculation: calculateSuggestedDose({
      glucose: turn.glucose,
      carbohydrates: turn.total_carbohydrates,
      target_glucose: settings.target_glucose,
      correction_factor: settings.correction_factor,
      carbohydrate_ratio: carbohydrateRatioFor(settings, turn.meal_type),
      trend: turn.glucose_trend
    })
  };
}
