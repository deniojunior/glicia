import { describe, expect, it } from "vitest";

import { MemoryPreferencesRepository } from "../adapters/storage/memory-preferences-repository";
import { createOnboardingProgress, preferencesFromProgress } from "../domain";
import { PreferencesService } from "./preferences";

describe("PreferencesService", () => {
  it("retoma o onboarding sem persistir credenciais", async () => {
    const repository = new MemoryPreferencesRepository();
    const service = new PreferencesService(repository);
    const progress = createOnboardingProgress({ step: "carbohydrate_ratios" });

    await service.saveOnboarding(progress);

    expect(await service.loadOnboarding()).toEqual(progress);
    expect(JSON.stringify(repository.onboarding)).not.toContain("apiKey");
  });

  it("salva preferências validadas e remove o rascunho ao concluir", async () => {
    const repository = new MemoryPreferencesRepository();
    const service = new PreferencesService(repository);
    const progress = createOnboardingProgress({ interaction_mode: "rapido" });

    await service.saveOnboarding(progress);
    await service.save(preferencesFromProgress(progress));
    await service.clearOnboarding();

    expect((await service.load())?.interaction_mode).toBe("preciso");
    expect(await service.loadOnboarding()).toBeNull();
  });

  it("retoma um rascunho legado sem parar na etapa BYOK removida", () => {
    const progress = createOnboardingProgress({ step: "provider" as never });

    expect(progress.step).toBe("carbohydrate_ratios");
  });

  it("mantém a etapa conversacional atual ao retomar o onboarding", () => {
    const progress = createOnboardingProgress({ step: "clinical_settings" });

    expect(progress.step).toBe("clinical_settings");
  });
});
