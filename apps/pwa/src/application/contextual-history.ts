import { GLUCOSE_TRENDS, type GlucoseTrend, type MealType } from "../domain";
import { createConversationTurn } from "./session";
import type { MealHistoryRepository, MealRecord } from "./meal-history";

export interface HistoricalMealReference {
  from: string;
  to: string;
  mealType?: MealType;
}

export function resolveHistoricalMealReference(message: string, now = new Date()): HistoricalMealReference | null {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const refersToReuse = /\b(mesm[ao]|igual|repetir|repete|repeticao)\b/.test(normalized);
  if (!refersToReuse || !/\bontem\b/.test(normalized)) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { from: start.toISOString(), to: end.toISOString(), mealType: mealTypeFromText(normalized) };
}

export async function findHistoricalMealCandidates(repository: MealHistoryRepository, message: string, now = new Date()): Promise<readonly MealRecord[] | null> {
  const reference = resolveHistoricalMealReference(message, now);
  if (!reference) return null;
  return repository.findBetween(reference.from, reference.to, reference.mealType);
}

export function createReusedMealTurn(record: MealRecord, glucoseValue: string, glucoseTrend: GlucoseTrend | "") {
  const normalized = glucoseValue.trim().replace(",", ".");
  const glucose = normalized ? Number(normalized) : Number.NaN;
  if (!Number.isFinite(glucose) || glucose <= 0) throw new Error("Informe a glicemia atual em um valor válido.");
  if (!GLUCOSE_TRENDS.includes(glucoseTrend as GlucoseTrend)) throw new Error("Selecione a tendência atual da glicose.");
  return createConversationTurn("Refeição recuperada do histórico. Confira os alimentos, os carboidratos e os dados atuais antes de confirmar.", {
    total_carbohydrates: record.carbohydrates,
    glucose,
    glucose_trend: glucoseTrend as GlucoseTrend,
    meal_type: record.meal_type,
    meal_items: record.meal_items
  });
}

export function historicalMealDescription(record: MealRecord): string {
  if (record.meal_items.length > 0) return record.meal_items.map((item) => `${item.name} (${item.portion})`).join(", ");
  return record.assistant_summary || record.meal_input;
}

function mealTypeFromText(message: string): MealType | undefined {
  if (/\b(cafe da manha|desjejum)\b/.test(message)) return "CAFE_DA_MANHA";
  if (/\b(almoco|almocar)\b/.test(message)) return "ALMOCO";
  if (/\b(cafe da tarde|lanche da tarde)\b/.test(message)) return "CAFE_DA_TARDE";
  if (/\b(jantar|janta)\b/.test(message)) return "JANTAR";
  if (/\bceia\b/.test(message)) return "CEIA";
  return undefined;
}
