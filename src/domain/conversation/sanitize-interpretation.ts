// src/domain/conversation/sanitize-interpretation.ts
//
// sanitizeInterpretation — normaliza saída arbitrária/não-confiável de um
// Interpreter no contrato canônico MealInterpretation (Req 3.9, 3.10).
//
// Princípio arquitetural central:
//   "IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."
//
// O contrato MealInterpretation NUNCA contém dose de insulina (Req 3.1, 3.9).
// Qualquer campo de dose ("dose", "insulin", "insulinDose") ou qualquer outra
// propriedade fora do contrato é IGNORADO ao construir o resultado (Req 3.10).
//
// Esta função é defensiva por design: aceita `unknown`, jamais lança exceção e
// sempre retorna um MealInterpretation bem formado. Isso protege o pipeline de
// domínio contra interpretadores futuros (ex.: OpenAI) que possam retornar
// campos extras, tipos incorretos ou estruturas inesperadas.

import type {
  InterpretedItem,
  MealInterpretation,
  MealType,
  GlucoseTrend,
  MissingInfo,
} from "../types.js";

// Número máximo de itens preservados (Req 3.5).
const MAX_ITEMS = 50;

// Valores canônicos aceitos para os enums do contrato.
const VALID_MEAL_TYPES: ReadonlySet<MealType> = new Set<MealType>([
  "BREAKFAST",
  "LUNCH",
  "SNACK",
  "DINNER",
]);
const VALID_GLUCOSE_TRENDS: ReadonlySet<GlucoseTrend> = new Set<GlucoseTrend>([
  "RISING_RAPIDLY", "RISING", "CHANGING_SLOWLY", "FALLING", "FALLING_RAPIDLY",
]);

const VALID_MISSING_INFO: ReadonlySet<MissingInfo> = new Set<MissingInfo>([
  "GLUCOSE",
  "MEAL",
  "FOOD_QUANTITY",
  "FOOD",
]);

// Verifica se um valor é um objeto não-nulo (registro indexável por string).
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Número finito estritamente positivo, senão null (Req 3.3, 3.5).
function toPositiveNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

// Carboidrato pode ser zero (ex.: café sem açúcar ou manteiga).
function toNonNegativeNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

// MealType válido ou null (Req 3.4).
function toMealTypeOrNull(value: unknown): MealType | null {
  return typeof value === "string" && VALID_MEAL_TYPES.has(value as MealType)
    ? (value as MealType)
    : null;
}

function toGlucoseTrendOrNull(value: unknown): GlucoseTrend | null {
  return typeof value === "string" && VALID_GLUCOSE_TRENDS.has(value as GlucoseTrend)
    ? value as GlucoseTrend : null;
}

// Texto ou null; qualquer outro tipo vira null (Req 3.5).
function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

// Normaliza um item cru em InterpretedItem, preservando apenas os campos
// do contrato (foodName, quantity, unit). Itens sem foodName utilizável são
// descartados retornando null (Req 3.5).
function sanitizeItem(raw: unknown): InterpretedItem | null {
  if (!isRecord(raw)) {
    return null;
  }

  const foodName =
    typeof raw.foodName === "string" ? raw.foodName.trim() : "";
  if (foodName.length === 0) {
    return null; // foodName deve ser texto não vazio (Req 3.5)
  }

  const carbohydrates = toNonNegativeNumberOrNull(raw.carbohydrates);
  return {
    foodName,
    quantity: toPositiveNumberOrNull(raw.quantity),
    unit: toStringOrNull(raw.unit),
    ...(carbohydrates === null ? {} : { carbohydrates }),
  };
}

// Normaliza a coleção de itens: aceita apenas arrays, mapeia cada elemento ao
// contrato, descarta inválidos e limita a no máximo 50 itens (Req 3.5).
function sanitizeItems(raw: unknown): InterpretedItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const items: InterpretedItem[] = [];
  for (const entry of raw) {
    if (items.length >= MAX_ITEMS) {
      break;
    }
    const item = sanitizeItem(entry);
    if (item !== null) {
      items.push(item);
    }
  }
  return items;
}

// Normaliza missingInformation: aceita apenas arrays, filtra para valores
// MissingInfo válidos e remove duplicatas preservando a ordem (Req 3.6).
function sanitizeMissingInformation(raw: unknown): MissingInfo[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<MissingInfo>();
  const result: MissingInfo[] = [];
  for (const entry of raw) {
    if (
      typeof entry === "string" &&
      VALID_MISSING_INFO.has(entry as MissingInfo) &&
      !seen.has(entry as MissingInfo)
    ) {
      seen.add(entry as MissingInfo);
      result.push(entry as MissingInfo);
    }
  }
  return result;
}

// Normaliza qualquer saída de interpretador no contrato canônico
// MealInterpretation, ignorando campos de dose e quaisquer propriedades extras
// (Req 3.9, 3.10). Nunca lança; sempre retorna um objeto bem formado.
export function sanitizeInterpretation(raw: unknown): MealInterpretation {
  if (!isRecord(raw)) {
    // Entrada não é objeto (null, string, número, array etc.): contrato vazio.
    return {
      glucose: null,
      glucoseTrend: null,
      meal: null,
      items: [],
      missingInformation: [],
    };
  }

  // Somente os quatro campos do contrato são lidos. Campos como "dose",
  // "insulin", "insulinDose" ou quaisquer outros são simplesmente ignorados
  // por não serem referenciados aqui (Req 3.10).
  const totalCarbohydrates = toNonNegativeNumberOrNull(raw.totalCarbohydrates);
  return {
    glucose: toPositiveNumberOrNull(raw.glucose),
    glucoseTrend: toGlucoseTrendOrNull(raw.glucoseTrend),
    meal: toMealTypeOrNull(raw.meal),
    items: sanitizeItems(raw.items),
    ...(totalCarbohydrates === null ? {} : { totalCarbohydrates }),
    missingInformation: sanitizeMissingInformation(raw.missingInformation),
  };
}
