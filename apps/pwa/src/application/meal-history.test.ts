import { expect, test } from "vitest";

import { createClinicalSettings } from "../domain";
import { createConversationTurn } from "./session";
import { createMealRecord } from "./meal-history";

test("cria registro imutável com os parâmetros e cálculo usados", () => {
  const record = createMealRecord({ id: "meal-1", createdAt: "2026-08-30T12:00:00Z", mealInput: "arroz", mode: "preciso", settings: createClinicalSettings(), carbohydrateRatio: 6, calculation: { correction: 0, carbohydrate_coverage: 10, trend_adjustment: 0, total: 10, suggested: 10 }, provider: "openai", model: "gpt-4o-mini", turn: createConversationTurn("Resumo", { total_carbohydrates: 60, glucose: 120, glucose_trend: "ESTAVEL", meal_type: "ALMOCO" }) });
  expect(record).toMatchObject({ id: "meal-1", carbohydrates: 60, suggested_dose: 10, applied_dose: null, carbohydrate_ratio: 6 });
});
