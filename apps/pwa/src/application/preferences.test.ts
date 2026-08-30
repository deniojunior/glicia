import { describe, expect, it } from "vitest";

import { MemoryPreferencesRepository } from "../adapters/storage/memory-preferences-repository";
import { createOnboardingProgress, preferencesFromProgress } from "../domain";
import { PreferencesService } from "./preferences";

describe("PreferencesService", () => {
  it("retoma o onboarding sem persistir credenciais", async () => {
    const repository = new MemoryPreferencesRepository();
    const service = new PreferencesService(repository);
    const progress = createOnboardingProgress({ step: "carbohydrate_ratios", provider: { provider: "openai", model: "gpt-4o-mini" } });

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

    expect((await service.load())?.interaction_mode).toBe("rapido");
    expect(await service.loadOnboarding()).toBeNull();
  });
});
