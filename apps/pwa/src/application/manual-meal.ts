import { GLUCOSE_TRENDS, MEAL_TYPES, type GlucoseTrend, type MealType } from "../domain";
import { createConversationTurn } from "./session";

export interface ManualMealInput {
  carbohydrates: string;
  glucose: string;
  glucoseTrend: GlucoseTrend | "";
  mealType: MealType | "";
}

export function createManualMealTurn(input: ManualMealInput, description = "Refeição informada manualmente") {
  const carbohydrates = requiredNumber(input.carbohydrates, "carboidratos", true);
  const glucose = requiredNumber(input.glucose, "glicemia", false);
  if (!GLUCOSE_TRENDS.includes(input.glucoseTrend as GlucoseTrend)) {
    throw new Error("Selecione a tendência da glicose.");
  }
  if (!MEAL_TYPES.includes(input.mealType as MealType)) {
    throw new Error("Selecione o tipo de refeição.");
  }
  return createConversationTurn("Dados informados manualmente. Confira o resumo antes de confirmar.", {
    total_carbohydrates: carbohydrates,
    glucose,
    glucose_trend: input.glucoseTrend as GlucoseTrend,
    meal_type: input.mealType as MealType,
    meal_items: [{ name: description.trim(), portion: "porção informada", carbohydrates }]
  });
}

function requiredNumber(value: string, label: string, acceptsZero: boolean): number {
  const normalized = value.trim().replace(",", ".");
  const parsed = normalized === "" ? Number.NaN : Number(normalized);
  if (!Number.isFinite(parsed) || (acceptsZero ? parsed < 0 : parsed <= 0)) {
    throw new Error(`Informe ${label} em um valor válido.`);
  }
  return parsed;
}
