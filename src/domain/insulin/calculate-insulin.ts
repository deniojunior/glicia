// src/domain/insulin/calculate-insulin.ts
//
// Motor de cálculo de insulina — função pura e determinística (Requisito 7).
//
// Princípio arquitetural: "Código calcula." Este é o ÚNICO lugar do código
// onde a dose de insulina é calculada (Req 7.8, 17.1).
//
// A função NÃO depende de Supabase, OpenAI, WhatsApp, HTTP, filesystem ou
// variáveis de ambiente (Req 7.7). Mesma entrada → mesma saída (Req 7.6).

/**
 * Versão da fórmula usada no cálculo. Reflete o protocolo atualmente
 * configurado na planilha da usuária (Req 9.6). Valor atual: "1.0".
 */
export const FORMULA_VERSION = "1.0";

/** Entradas numéricas obrigatórias do cálculo de insulina (Req 7.1, 7.2). */
export interface InsulinInput {
  glucose: number;
  carbohydrates: number;
  targetGlucose: number;
  correctionFactor: number;
  carbohydrateRatio: number;
}

/** Resultado do cálculo de insulina. */
export interface InsulinResult {
  /** (glucose - targetGlucose) / correctionFactor (Req 7.1) */
  correctionDose: number;
  /** carbohydrates / carbohydrateRatio (Req 7.2) */
  carbohydrateDose: number;
  /** Soma bruta de correctionDose + carbohydrateDose (Req 7.3, 7.5) */
  totalDose: number;
  /** Inteiro; empate 0,5 → inteiro de maior magnitude (Req 7.4) */
  roundedDose: number;
}

/**
 * Erro de domínio do cálculo de insulina. Sinalizado por exceção tipada,
 * nunca por um valor de dose (Req 7.12, 7.13). Não há exceções de IO.
 */
export class InsulinCalculationError extends Error {
  constructor(
    public readonly code:
      | "MISSING_OR_INVALID_INPUT" // Req 7.13
      | "ZERO_DIVISOR", // Req 7.12
    message: string,
  ) {
    super(message);
    this.name = "InsulinCalculationError";
  }
}

/**
 * Verifica se um valor é um número finito válido para o cálculo.
 * Rejeita null/undefined/não-número/NaN/Infinity/-Infinity (Req 7.13).
 */
function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Arredondamento "meio para longe do zero": no empate exato de 0,5 arredonda
 * para o inteiro de MAIOR magnitude (Req 7.4).
 *
 * `Math.round` arredonda o empate 0,5 sempre para +∞ (ex.: `Math.round(-2.5) === -2`),
 * o que não atende ao critério. Separando o sinal da magnitude garantimos:
 *   2,5 → 3 ; -2,5 → -3 ; 2,4 → 2 ; 2,6 → 3 ; 3,5 → 4.
 */
export function roundHalfAwayFromZero(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/**
 * Calcula as doses de insulina de forma pura e determinística (Req 7).
 *
 * @throws {InsulinCalculationError} `MISSING_OR_INVALID_INPUT` se qualquer
 *   entrada obrigatória for ausente/nula/não numérica/NaN/infinita (Req 7.13).
 * @throws {InsulinCalculationError} `ZERO_DIVISOR` se `correctionFactor` ou
 *   `carbohydrateRatio` for igual a zero (Req 7.12).
 */
export function calculateInsulin(input: InsulinInput): InsulinResult {
  // 1) Validação: todas as entradas numéricas obrigatórias devem ser finitas (Req 7.13).
  if (
    input === null ||
    typeof input !== "object" ||
    !isValidNumber(input.glucose) ||
    !isValidNumber(input.carbohydrates) ||
    !isValidNumber(input.targetGlucose) ||
    !isValidNumber(input.correctionFactor) ||
    !isValidNumber(input.carbohydrateRatio)
  ) {
    throw new InsulinCalculationError(
      "MISSING_OR_INVALID_INPUT",
      "Todas as entradas numéricas (glucose, carbohydrates, targetGlucose, correctionFactor, carbohydrateRatio) devem ser números finitos.",
    );
  }

  // 2) Divisores não podem ser zero (Req 7.12).
  if (input.correctionFactor === 0 || input.carbohydrateRatio === 0) {
    throw new InsulinCalculationError(
      "ZERO_DIVISOR",
      "correctionFactor e carbohydrateRatio devem ser diferentes de zero.",
    );
  }

  // 3) Dose de correção (Req 7.1, 7.9, 7.10).
  const correctionDose =
    (input.glucose - input.targetGlucose) / input.correctionFactor;

  // 4) Dose de carboidrato (Req 7.2, 7.11).
  const carbohydrateDose = input.carbohydrates / input.carbohydrateRatio;

  // 5) Dose total bruta (Req 7.3, 7.5).
  const totalDose = correctionDose + carbohydrateDose;

  // 6) Dose arredondada (Req 7.4).
  const roundedDose = roundHalfAwayFromZero(totalDose);

  return { correctionDose, carbohydrateDose, totalDose, roundedDose };
}
