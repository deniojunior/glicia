import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

import { ManualMealForm } from "./manual-meal-form";

test("permite omitir a descrição e oferece uma volta clara ao chat", () => {
  const html = renderToStaticMarkup(<ManualMealForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

  expect(html).toContain("Informar sem IA");
  expect(html).toContain("O que você comeu?");
  expect(html).toContain("Opcional");
  expect(html).toContain("Voltar ao chat");
  expect(html).toContain("Carboidratos (g)");
  expect(html).toContain("Glicemia (mg/dL)");
  expect(html).toContain("Tendência");
  expect(html).toContain("Tipo de refeição");
  expect(html).toContain("O cálculo continua local e exige confirmação");
});
