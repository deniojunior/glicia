import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { createOnboardingProgress, type PersistedPreferences } from "../domain";
import { Onboarding } from "./onboarding";
import { Settings } from "./settings";

const preferences: PersistedPreferences = {
  version: 1,
  interaction_mode: "preciso",
  clinical_settings: createOnboardingProgress().clinical_settings
};

test("explica RIC por extenso no onboarding e não solicita insulina basal", () => {
  const html = renderToStaticMarkup(<Onboarding
    initialProgress={createOnboardingProgress({ step: "carbohydrate_ratios" })}
    onProgress={async () => undefined}
    onComplete={async () => undefined}
  />);

  expect(html).toContain("RIC significa relação insulina-carboidrato");
  expect(html).toContain("g por 1 U");
  expect(html).not.toContain("Basal pela manhã");
});

test("não mostra basal na revisão do onboarding", () => {
  const html = renderToStaticMarkup(<Onboarding
    initialProgress={createOnboardingProgress({ step: "review" })}
    onProgress={async () => undefined}
    onComplete={async () => undefined}
  />);

  expect(html).toContain("Glicemia-alvo");
  expect(html).toContain("Limite de hipoglicemia");
  expect(html).not.toContain("Basal pela manhã");
});

test("permite ajustar parâmetros de glicemia e RICs após o login", () => {
  const html = renderToStaticMarkup(<Settings
    preferences={preferences}
    onSave={async () => undefined}
    onBack={() => undefined}
  />);

  expect(html).toContain("Ajustes do tratamento");
  expect(html).toContain("Glicemia-alvo");
  expect(html).toContain("Fator de correção");
  expect(html).toContain("Limite de hipoglicemia");
  expect(html).toContain("Relação insulina-carboidrato (RIC)");
  expect(html).not.toContain("Basal pela manhã");
});
