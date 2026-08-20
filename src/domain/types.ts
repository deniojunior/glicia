// src/domain/types.ts
//
// Tipos de domínio do Glicia (Fase 1 — MVP Local).
// Núcleo puro: sem dependência de canal, IO, rede ou env.
//
// Princípio arquitetural central:
//   "IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."
//
// O contrato `MealInterpretation` NUNCA contém campo de dose (Req 3.1, 3.9).

export type MealType = "BREAKFAST" | "LUNCH" | "SNACK" | "DINNER";

/** Direção/velocidade informada pelo sensor contínuo de glicose. */
export type GlucoseTrend =
  | "RISING_RAPIDLY"
  | "RISING"
  | "CHANGING_SLOWLY"
  | "FALLING"
  | "FALLING_RAPIDLY";

export type MissingInfo = "GLUCOSE" | "MEAL" | "FOOD_QUANTITY" | "FOOD";

export type ConversationStatus =
  | "ACTIVE"
  | "WAITING_CONFIRMATION"
  | "COMPLETED"
  | "CANCELLED";

// Item cru extraído pelo interpretador (SEM dados nutricionais).
export interface InterpretedItem {
  foodName: string; // não vazio (Req 3.5)
  quantity: number | null; // > 0 ou null (Req 3.5)
  unit: string | null; // texto ou null (Req 3.5)
  /** Carboidratos desta porção, calculados pela LLM a partir da tabela enviada. */
  carbohydrates?: number | null;
}

// Contrato produzido pelo Interpreter — NUNCA contém dose (Req 3.1, 3.9).
export interface MealInterpretation {
  glucose: number | null; // > 0 ou null (Req 3.3)
  /** Tendência explicitamente informada; é descritiva e não altera a dose. */
  glucoseTrend?: GlucoseTrend | null;
  meal: MealType | null; // (Req 3.4)
  items: InterpretedItem[]; // no máx. 50 (Req 3.5)
  /** Total em gramas calculado pela LLM a partir da tabela enviada. */
  totalCarbohydrates?: number | null;
  missingInformation: MissingInfo[]; // (Req 3.6)
}
