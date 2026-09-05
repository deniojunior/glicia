import type { ClinicalSettings, ConversationTurn, InteractionMode, MealItem, MealType } from "../domain";
import type { DoseCalculation } from "../domain";

export interface MealRecord {
  id: string;
  created_at: string;
  meal_input: string;
  assistant_summary: string;
  interaction_mode: InteractionMode;
  meal_type: MealType;
  meal_items: readonly MealItem[];
  carbohydrates: number;
  glucose: number;
  glucose_trend: NonNullable<ConversationTurn["glucose_trend"]>;
  target_glucose: number;
  correction_factor: number;
  carbohydrate_ratio: number;
  basal_morning_units: number;
  correction_dose: number;
  carbohydrate_dose: number;
  trend_adjustment: number;
  calculated_dose: number;
  suggested_dose: number;
  applied_dose: number | null;
  provider: string;
  model: string;
}

export interface MealHistoryRepository {
  saveRecord(record: MealRecord): Promise<void>;
  list(): Promise<readonly MealRecord[]>;
  findBetween(from: string, to: string, mealType?: MealType): Promise<readonly MealRecord[]>;
  deleteRecord(recordId: string): Promise<void>;
  clearRecords(): Promise<void>;
}

export interface FoodMemoryRepository {
  load(): Promise<Readonly<Record<string, string>>>;
  saveMemory(memory: Readonly<Record<string, string>>): Promise<void>;
}

export function createMealRecord(input: {
  id: string; createdAt: string; mealInput: string; turn: ConversationTurn; mode: InteractionMode; settings: ClinicalSettings; calculation: DoseCalculation; carbohydrateRatio: number; provider: string; model: string;
}): MealRecord {
  const { turn } = input;
  if (turn.total_carbohydrates === null || turn.glucose === null || turn.glucose_trend === null || turn.meal_type === null) throw new Error("A refeição precisa estar completa.");
  return { id: input.id, created_at: input.createdAt, meal_input: input.mealInput, assistant_summary: turn.reply, interaction_mode: input.mode, meal_type: turn.meal_type, meal_items: turn.meal_items, carbohydrates: turn.total_carbohydrates, glucose: turn.glucose, glucose_trend: turn.glucose_trend, target_glucose: input.settings.target_glucose, correction_factor: input.settings.correction_factor, carbohydrate_ratio: input.carbohydrateRatio, basal_morning_units: input.settings.basal_morning_units, correction_dose: input.calculation.correction, carbohydrate_dose: input.calculation.carbohydrate_coverage, trend_adjustment: input.calculation.trend_adjustment, calculated_dose: input.calculation.total, suggested_dose: input.calculation.suggested, applied_dose: null, provider: input.provider, model: input.model };
}
