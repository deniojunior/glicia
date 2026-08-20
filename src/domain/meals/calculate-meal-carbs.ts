// src/domain/meals/calculate-meal-carbs.ts
//
// calculateMealCarbs — cálculo determinístico de carboidratos (Req 5).
//
// Função pura: mesmas entradas → mesmo total (Req 5.3). Sem IO, rede ou env.
// O CHO é calculado exclusivamente pelo código a partir dos valores nutricionais
// vindos do Food_Database (Req 4.9, 4.10). O Interpreter NUNCA é fonte da
// multiplicação (Req 5.3).
//
// Regra por item (Req 5.1):
//   carbItem = round2(quantity * (carbsPerServing / servingQuantity))
// Total (Req 5.2):
//   total = round2(soma dos carbItem válidos)
// Itens inválidos são excluídos do total sem interromper os demais (Req 5.5, 5.6).

// Item já resolvido a um Food com valor de carboidrato por medida (Req 4, 5.1).
export interface ResolvedItem {
  foodName: string;
  quantity: number; // esperada > 0 e numérica (validada aqui — Req 5.6)
  /** Measures such as cups/spoons count database servings, rather than grams. */
  quantityMode?: "SERVINGS" | "WEIGHT";
  unit: string | null;
  carbsPerServing: number; // carboidrato por medida, vindo do Food (Req 4.9)
  servingQuantity: number; // default_serving_quantity do Food
  foodId: string;
  /** Valor calculado pela LLM a partir da tabela fornecida no prompt. */
  llmCarbohydrates?: number | null;
}

// Item não incluído no cálculo, com o motivo (Req 5.5, 5.6).
export interface UnresolvedItem {
  foodName: string;
  reason: "NO_FOOD_MATCH" | "INVALID_QUANTITY";
}

export interface MealCarbsResult {
  // CHO por item resolvido, 2 casas decimais (Req 5.4).
  perItem: { foodId: string; foodName: string; carbohydrates: number }[];
  // Soma dos itens resolvidos, em gramas com 2 casas decimais (Req 5.2).
  totalCarbohydrates: number;
  // Itens excluídos do cálculo, preservando os já resolvidos (Req 5.5).
  unresolved: UnresolvedItem[];
}

// Arredonda para 2 casas decimais em gramas (Req 5.1, 5.2, 5.4).
export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

// Verifica se um valor é um número finito utilizável no cálculo.
function isUsableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Determinístico: entradas idênticas → mesmo total (Req 5.3).
// Itens com quantidade inválida (<= 0, ausente, não numérica, NaN ou infinita)
// ou com servingQuantity inválida (<= 0, não numérica) são rejeitados com
// reason INVALID_QUANTITY, sem interromper o cálculo dos demais (Req 5.6).
export function calculateMealCarbs(items: ResolvedItem[]): MealCarbsResult {
  const perItem: MealCarbsResult["perItem"] = [];
  const unresolved: UnresolvedItem[] = [];
  let total = 0;

  for (const item of items) {
    const validQuantity = isUsableNumber(item.quantity) && item.quantity > 0;
    const validServing =
      isUsableNumber(item.servingQuantity) && item.servingQuantity > 0;
    const validCarbs = isUsableNumber(item.carbsPerServing);

    if (!validQuantity || !validServing || !validCarbs) {
      unresolved.push({ foodName: item.foodName, reason: "INVALID_QUANTITY" });
      continue;
    }

    const carbohydrates = round2(item.quantityMode === "SERVINGS"
      ? item.quantity * item.carbsPerServing
      : (item.quantity * item.carbsPerServing) / item.servingQuantity);
    perItem.push({
      foodId: item.foodId,
      foodName: item.foodName,
      carbohydrates,
    });
    total += carbohydrates;
  }

  return {
    perItem,
    totalCarbohydrates: round2(total),
    unresolved,
  };
}
