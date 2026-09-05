import type { InteractionMode } from "./models";
import { createClinicalSettings, type ClinicalSettings } from "./settings";

export interface PersistedPreferences {
  version: 1;
  clinical_settings: ClinicalSettings;
  interaction_mode: InteractionMode;
}

export type OnboardingStep = "welcome" | "carbohydrate_ratios" | "review";

export interface OnboardingProgress {
  version: 1;
  step: OnboardingStep;
  interaction_mode: InteractionMode;
  clinical_settings: ClinicalSettings;
}

export function createOnboardingProgress(
  values: Partial<Omit<OnboardingProgress, "version" | "clinical_settings">> & {
    clinical_settings?: Partial<ClinicalSettings>;
  } = {}
): OnboardingProgress {
  return {
    version: 1,
    step: normalizeStep(values.step),
    interaction_mode: values.interaction_mode ?? "preciso",
    clinical_settings: createClinicalSettings(values.clinical_settings)
  };
}

function normalizeStep(step: OnboardingStep | undefined): OnboardingStep {
  // Compatibilidade com rascunhos da v0.8, que tinham uma etapa exclusiva para BYOK.
  if ((step as string | undefined) === "provider") return "carbohydrate_ratios";
  return step ?? "welcome";
}

export function preferencesFromProgress(progress: OnboardingProgress): PersistedPreferences {
  return {
    version: 1,
    interaction_mode: progress.interaction_mode,
    clinical_settings: createClinicalSettings(progress.clinical_settings)
  };
}
