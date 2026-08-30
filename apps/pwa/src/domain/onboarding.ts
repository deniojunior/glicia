import type { InteractionMode } from "./models";
import { createClinicalSettings, type ClinicalSettings } from "./settings";

export type SupportedProvider = "openai";

export interface ProviderSelection {
  provider: SupportedProvider;
  model: string;
}

export interface PersistedPreferences {
  version: 1;
  clinical_settings: ClinicalSettings;
  interaction_mode: InteractionMode;
  provider: ProviderSelection;
}

export type OnboardingStep = "welcome" | "provider" | "carbohydrate_ratios" | "review";

export interface OnboardingProgress {
  version: 1;
  step: OnboardingStep;
  provider: ProviderSelection;
  interaction_mode: InteractionMode;
  clinical_settings: ClinicalSettings;
}

export const DEFAULT_PROVIDER_SELECTION: ProviderSelection = {
  provider: "openai",
  model: "gpt-4o-mini"
};

export function createOnboardingProgress(
  values: Partial<Omit<OnboardingProgress, "version" | "clinical_settings">> & {
    clinical_settings?: Partial<ClinicalSettings>;
  } = {}
): OnboardingProgress {
  const model = values.provider?.model.trim() ?? DEFAULT_PROVIDER_SELECTION.model;
  if (!model) throw new Error("Escolha um modelo para continuar.");
  return {
    version: 1,
    step: values.step ?? "welcome",
    provider: { provider: values.provider?.provider ?? "openai", model },
    interaction_mode: values.interaction_mode ?? "preciso",
    clinical_settings: createClinicalSettings(values.clinical_settings)
  };
}

export function preferencesFromProgress(progress: OnboardingProgress): PersistedPreferences {
  return {
    version: 1,
    provider: progress.provider,
    interaction_mode: progress.interaction_mode,
    clinical_settings: createClinicalSettings(progress.clinical_settings)
  };
}
