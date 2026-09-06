import type { SupabaseClient } from "@supabase/supabase-js";

import type { FoodMemoryRepository, MealHistoryRepository, MealRecord } from "../../application";

export class SupabaseMealRepository implements MealHistoryRepository, FoodMemoryRepository {
  public constructor(private readonly client: SupabaseClient, private readonly userId: string) {}

  public async saveRecord(record: MealRecord): Promise<void> {
    const { error } = await this.client.from("meal_records").upsert({ ...record, user_id: this.userId }, { onConflict: "id,user_id" });
    if (error) throw new Error("Não foi possível salvar a refeição na sua conta.");
  }

  public async list(): Promise<readonly MealRecord[]> {
    const records: MealRecord[] = [];
    // Continue until an empty page, even if the server caps each response.
    for (;;) {
      const { data, error } = await this.client.from("meal_records").select("*").eq("user_id", this.userId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).range(records.length, records.length + 499);
      if (error) throw new Error("Não foi possível carregar o histórico da sua conta.");
      if (!data?.length) return records;
      records.push(...data.map(toMealRecord));
    }
  }

  public async findBetween(from: string, to: string, mealType?: MealRecord["meal_type"]): Promise<readonly MealRecord[]> {
    let query = this.client.from("meal_records").select("*").eq("user_id", this.userId).gte("created_at", from).lt("created_at", to).order("created_at", { ascending: false });
    if (mealType) query = query.eq("meal_type", mealType);
    const { data, error } = await query;
    if (error) throw new Error("Não foi possível consultar as refeições anteriores.");
    return (data ?? []).map(toMealRecord);
  }

  public async deleteRecord(recordId: string): Promise<void> {
    const { error } = await this.client.from("meal_records").delete().eq("id", recordId).eq("user_id", this.userId);
    if (error) throw new Error("Não foi possível excluir esta refeição.");
  }

  public async clearRecords(): Promise<void> {
    const { error } = await this.client.from("meal_records").delete().eq("user_id", this.userId);
    if (error) throw new Error("Não foi possível apagar o histórico.");
  }

  public async load(): Promise<Readonly<Record<string, string>>> {
    const { data, error } = await this.client.from("food_memory").select("food, usual_preparation").eq("user_id", this.userId);
    if (error) throw new Error("Não foi possível carregar a memória alimentar da sua conta.");
    return Object.fromEntries((data ?? []).map((item) => [item.food, item.usual_preparation]));
  }

  public async saveMemory(memory: Readonly<Record<string, string>>): Promise<void> {
    const rows = Object.entries(memory).map(([food, usual_preparation]) => ({ user_id: this.userId, food, usual_preparation }));
    if (rows.length === 0) return;
    const { error } = await this.client.from("food_memory").upsert(rows, { onConflict: "user_id,food" });
    if (error) throw new Error("Não foi possível salvar a memória alimentar na sua conta.");
  }
}

function toMealRecord(row: Record<string, unknown>): MealRecord {
  const numeric = (value: unknown) => Number(value);
  return {
    id: String(row.id), created_at: String(row.created_at), meal_input: String(row.meal_input), assistant_summary: String(row.assistant_summary),
    interaction_mode: row.interaction_mode as MealRecord["interaction_mode"], meal_type: row.meal_type as MealRecord["meal_type"], meal_items: Array.isArray(row.meal_items) ? row.meal_items as unknown as MealRecord["meal_items"] : [],
    carbohydrates: numeric(row.carbohydrates), glucose: numeric(row.glucose), glucose_trend: row.glucose_trend as MealRecord["glucose_trend"],
    target_glucose: numeric(row.target_glucose), correction_factor: numeric(row.correction_factor), carbohydrate_ratio: numeric(row.carbohydrate_ratio), basal_morning_units: numeric(row.basal_morning_units),
    correction_dose: numeric(row.correction_dose), carbohydrate_dose: numeric(row.carbohydrate_dose), trend_adjustment: numeric(row.trend_adjustment), calculated_dose: numeric(row.calculated_dose), suggested_dose: numeric(row.suggested_dose),
    applied_dose: row.applied_dose === null ? null : numeric(row.applied_dose), provider: String(row.provider), model: String(row.model)
  };
}
