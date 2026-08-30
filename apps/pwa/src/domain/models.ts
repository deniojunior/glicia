export const GLUCOSE_TRENDS = [
  "SUBINDO_RAPIDO",
  "SUBINDO",
  "ESTAVEL",
  "CAINDO",
  "CAINDO_RAPIDO",
  "NAO_INFORMADA"
] as const;

export type GlucoseTrend = (typeof GLUCOSE_TRENDS)[number];

export const MEAL_TYPES = [
  "CAFE_DA_MANHA",
  "ALMOCO",
  "CAFE_DA_TARDE",
  "JANTAR",
  "CEIA"
] as const;

export type MealType = (typeof MEAL_TYPES)[number];

export type InteractionMode = "preciso" | "rapido";

export interface FoodMemoryUpdate {
  food: string;
  usual_preparation: string;
}

export interface ConversationTurn {
  reply: string;
  total_carbohydrates: number | null;
  glucose: number | null;
  glucose_trend: GlucoseTrend | null;
  meal_type: MealType | null;
  food_memory_updates: readonly FoodMemoryUpdate[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function optionalTrend(value: unknown): GlucoseTrend | null {
  if (typeof value !== "string" || !GLUCOSE_TRENDS.includes(value as GlucoseTrend)) {
    return null;
  }
  return value as GlucoseTrend;
}

function optionalMealType(value: unknown): MealType | null {
  if (typeof value !== "string" || !MEAL_TYPES.includes(value as MealType)) {
    return null;
  }
  return value as MealType;
}

function foodMemoryUpdates(value: unknown): readonly FoodMemoryUpdate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.food !== "string" ||
      typeof item.usual_preparation !== "string"
    ) {
      return [];
    }
    return [{ food: item.food, usual_preparation: item.usual_preparation }];
  });
}

export function conversationTurnFromResponse(payload: unknown): ConversationTurn {
  const response = isRecord(payload) ? payload : {};
  return {
    reply:
      typeof response.reply === "string"
        ? response.reply
        : "Não consegui responder. Tente novamente.",
    total_carbohydrates: optionalNumber(response.total_carbohydrates),
    glucose: optionalNumber(response.glucose),
    glucose_trend: optionalTrend(response.glucose_trend),
    meal_type: optionalMealType(response.meal_type),
    food_memory_updates: foodMemoryUpdates(response.food_memory_updates)
  };
}

export function isConversationTurnComplete(turn: ConversationTurn): boolean {
  return (
    turn.total_carbohydrates !== null &&
    turn.total_carbohydrates >= 0 &&
    turn.glucose !== null &&
    turn.glucose > 0 &&
    turn.glucose_trend !== null &&
    turn.meal_type !== null
  );
}

export function mergeFoodMemory(
  current: Readonly<Record<string, string>>,
  updates: readonly FoodMemoryUpdate[]
): Record<string, string> {
  const merged = { ...current };
  for (const update of updates) {
    const food = update.food.trim().toLocaleLowerCase("pt-BR");
    const preparation = update.usual_preparation.trim();
    if (food && preparation) {
      merged[food] = preparation;
    }
  }
  return merged;
}
