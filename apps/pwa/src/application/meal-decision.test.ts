import { expect, test } from "vitest";

import { createClinicalSettings, type MealType } from "../domain";
import { createConversationTurn } from "./session";
import { decideConfirmedMeal } from "./meal-decision";

test("bloqueia bolus abaixo do limite de hipoglicemia", () => {
  const decision = decideConfirmedMeal(createConversationTurn("Resumo", { total_carbohydrates: 30, glucose: 65, glucose_trend: "ESTAVEL", meal_type: "ALMOCO" }), createClinicalSettings());
  expect(decision.safety.bolus_blocked).toBe(true);
  expect(decision.calculation).toBeNull();
});

test("calcula depois da confirmação com o RIC da refeição", () => {
  const decision = decideConfirmedMeal(createConversationTurn("Resumo", { total_carbohydrates: 60, glucose: 120, glucose_trend: "ESTAVEL", meal_type: "ALMOCO" }), createClinicalSettings());
  expect(decision.calculation?.suggested).toBe(10);
});

test.each<[MealType, number]>([
  ["CAFE_DA_MANHA", 15], ["ALMOCO", 10], ["CAFE_DA_TARDE", 6], ["JANTAR", 5], ["CEIA", 3]
])("usa o RIC personalizado de %s", (mealType, expected) => {
  const settings = createClinicalSettings({
    carbohydrate_ratios: { CAFE_DA_MANHA: 4, ALMOCO: 6, CAFE_DA_TARDE: 10, JANTAR: 12, CEIA: 20 }
  });
  const turn = createConversationTurn("Resumo", { total_carbohydrates: 60, glucose: 120, glucose_trend: "ESTAVEL", meal_type: mealType });
  expect(decideConfirmedMeal(turn, settings).calculation?.carbohydrate_coverage).toBe(expected);
});

test.each(["total_carbohydrates", "glucose", "glucose_trend", "meal_type"] as const)("não calcula com %s ausente", (field) => {
  const turn = createConversationTurn("Resumo", { total_carbohydrates: 30, glucose: 120, glucose_trend: "ESTAVEL", meal_type: "ALMOCO", [field]: null });
  expect(() => decideConfirmedMeal(turn, createClinicalSettings())).toThrow("completa");
});

test("usa meta e fator personalizados e não soma a basal à sugestão", () => {
  const turn = createConversationTurn("Resumo", { total_carbohydrates: 30, glucose: 160, glucose_trend: "ESTAVEL", meal_type: "JANTAR" });
  const settings = createClinicalSettings({ target_glucose: 100, correction_factor: 30, basal_morning_units: 0 });
  const decision = decideConfirmedMeal(turn, settings);
  expect(decision.calculation).toEqual({ correction: 2, carbohydrate_coverage: 3, trend_adjustment: 0, total: 5, suggested: 5 });
  expect(decideConfirmedMeal(turn, { ...settings, basal_morning_units: 50 })).toEqual(decision);
});
