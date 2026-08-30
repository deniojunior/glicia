import type { MealType } from "./models";

export interface ClinicalSettings {
  target_glucose: number;
  correction_factor: number;
  carbohydrate_ratios: Record<MealType, number>;
  basal_morning_units: number;
  hypoglycemia_threshold: number;
}

export const DEFAULT_CLINICAL_SETTINGS: ClinicalSettings = {
  target_glucose: 120,
  correction_factor: 40,
  carbohydrate_ratios: {
    CAFE_DA_MANHA: 8,
    ALMOCO: 6,
    CAFE_DA_TARDE: 8,
    JANTAR: 10,
    CEIA: 8
  },
  basal_morning_units: 28,
  hypoglycemia_threshold: 70
};

export function validateClinicalSettings(settings: ClinicalSettings): ClinicalSettings {
  const numericValues = [
    settings.target_glucose,
    settings.correction_factor,
    settings.basal_morning_units,
    settings.hypoglycemia_threshold,
    ...Object.values(settings.carbohydrate_ratios)
  ];
  if (!numericValues.every(Number.isFinite)) {
    throw new Error("Os parâmetros devem ser números finitos.");
  }
  if (settings.target_glucose <= 0) {
    throw new Error("Glicemia-alvo deve ser maior que zero.");
  }
  if (
    settings.correction_factor <= 0 ||
    Object.values(settings.carbohydrate_ratios).some((ratio) => ratio <= 0)
  ) {
    throw new Error("Fator de correção e RIC devem ser maiores que zero.");
  }
  if (settings.basal_morning_units < 0) {
    throw new Error("Basal aplicada pela manhã não pode ser negativa.");
  }
  if (settings.hypoglycemia_threshold <= 0) {
    throw new Error("HYPOGLYCEMIA_THRESHOLD deve ser maior que zero.");
  }
  return settings;
}

export function createClinicalSettings(
  values: Partial<ClinicalSettings> = {}
): ClinicalSettings {
  const settings: ClinicalSettings = {
    ...DEFAULT_CLINICAL_SETTINGS,
    ...values,
    carbohydrate_ratios: {
      ...DEFAULT_CLINICAL_SETTINGS.carbohydrate_ratios,
      ...values.carbohydrate_ratios
    }
  };
  return validateClinicalSettings(settings);
}

export function carbohydrateRatioFor(settings: ClinicalSettings, mealType: MealType): number {
  return settings.carbohydrate_ratios[mealType];
}
