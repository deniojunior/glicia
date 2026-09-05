import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

import type { MealRecord } from "../application";
import { HistoricalMealReuse } from "./historical-meal-reuse";

test("mostra a refeição recuperada sem sugerir a dose anterior", () => {
  const record: MealRecord = {
    id: "meal-1", created_at: "2026-09-04T15:00:00Z", meal_input: "almoço", assistant_summary: "Arroz e feijão", interaction_mode: "preciso",
    meal_type: "ALMOCO", meal_items: [{ name: "Arroz", portion: "100 g", carbohydrates: 28 }], carbohydrates: 52, glucose: 120, glucose_trend: "ESTAVEL",
    target_glucose: 100, correction_factor: 30, carbohydrate_ratio: 6, basal_morning_units: 10, correction_dose: 0.67, carbohydrate_dose: 8.67,
    trend_adjustment: 0, calculated_dose: 9.34, suggested_dose: 8, applied_dose: 8, provider: "openai", model: "gpt-4o-mini"
  };
  const html = renderToStaticMarkup(<HistoricalMealReuse candidates={[record]} onSubmit={vi.fn()} onCancel={vi.fn()} />);

  expect(html).toContain("Arroz");
  expect(html).toContain("100 g");
  expect(html).toContain("Glicemia atual");
  expect(html).toContain("A dose anterior não será reutilizada");
  expect(html).not.toContain("8 U");
});
