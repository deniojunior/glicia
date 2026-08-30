import { expect, test } from "vitest";

import { createClinicalSettings } from "../domain";
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
