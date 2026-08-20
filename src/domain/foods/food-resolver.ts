import type { InterpretedItem } from "../types.js";
import type { Food, FoodMeasure, Repository } from "../ports/repository.js";
import type { ResolvedItem } from "../meals/calculate-meal-carbs.js";
import { CandidateProvider, MAX_CANDIDATES, type CandidateSet, type FoodCandidate } from "./candidate-provider.js";
import { normalizeKey } from "./normalizer.js";

export function normalizeName(raw: string): string { return normalizeKey(raw); }
export type SelectionOutcome =
  | { kind: "RESOLVED"; item: ResolvedItem; candidate: FoodCandidate }
  | { kind: "NEEDS_FOOD_DISAMBIGUATION"; foodName: string; candidateSet: CandidateSet; saturated: boolean }
  | { kind: "NEEDS_MEASURE_DISAMBIGUATION"; foodName: string; food: Food; candidates: FoodCandidate[]; item: InterpretedItem }
  | { kind: "NEEDS_FOOD_CLARIFICATION"; foodName: string; question: string }
  | { kind: "UNRESOLVED"; foodName: string };
export type ResolutionOutcome = SelectionOutcome;
export interface FoodResolverDeps {
  candidateProvider: CandidateProvider;
  memory?: Pick<Repository, "findFoodMemory">;
}
type LegacyRepo = Pick<Repository, "findFoodByAliasExact" | "findFoodByNameExact" | "findFoodCandidates" | "findMeasuresByFoodId">;

export class FoodResolver {
  private readonly candidateProvider?: CandidateProvider;
  private readonly legacyRepo?: LegacyRepo;
  private readonly memory: Pick<Repository, "findFoodMemory"> | undefined;
  constructor(deps: FoodResolverDeps | (LegacyRepo & Partial<Pick<Repository, "listActiveFoodEntries">>)) {
    if ("candidateProvider" in deps) { this.candidateProvider = deps.candidateProvider; this.memory = deps.memory; }
    else if ("listActiveFoodEntries" in deps) { this.candidateProvider = new CandidateProvider(deps as Pick<Repository, "listActiveFoodEntries">); this.legacyRepo = deps; }
    else this.legacyRepo = deps;
  }
  async resolveItem(item: InterpretedItem, _userText = item.foodName): Promise<SelectionOutcome> {
    if (!normalizeKey(item.foodName)) return { kind: "UNRESOLVED", foodName: item.foodName };
    if (this.candidateProvider && this.memory) {
      const remembered = await this.memory.findFoodMemory(normalizeKey(item.foodName));
      if (remembered !== null) {
        const candidate = await this.candidateProvider.candidateForIds(remembered.foodId, remembered.measureId);
        if (candidate !== null) {
          return { kind: "RESOLVED", item: this.toResolvedItem(item, candidate.food, candidate.measure), candidate };
        }
      }
    }
    return this.candidateProvider ? this.resolveWithCandidates(item) : this.resolveLegacy(item);
  }
  async resolveAll(items: InterpretedItem[], userText = ""): Promise<SelectionOutcome[]> { return Promise.all(items.map((item) => this.resolveItem(item, userText || item.foodName))); }
  private async resolveWithCandidates(item: InterpretedItem): Promise<SelectionOutcome> {
    const candidateSet = await this.candidateProvider!.candidatesFor(item.foodName);
    if (!candidateSet.candidates.length) {
      return { kind: "UNRESOLVED", foodName: item.foodName };
    }
    if (candidateSet.distinctFoodCount === MAX_CANDIDATES) return { kind: "NEEDS_FOOD_DISAMBIGUATION", foodName: item.foodName, candidateSet, saturated: true };
    let candidates = candidateSet.candidates;
    if (candidateSet.distinctFoodCount > 1) return { kind: "NEEDS_FOOD_DISAMBIGUATION", foodName: item.foodName, candidateSet, saturated: false };
    return this.resolveMeasure(item, candidates[0]!.food, candidates);
  }
  private resolveMeasure(item: InterpretedItem, food: Food, candidates: FoodCandidate[]): SelectionOutcome {
    const all = candidates.filter((candidate) => candidate.food.id === food.id);
    const matches = item.unit === null ? all : all.filter((candidate) => matchesMeasureUnit(item.unit!, candidate.measure.servingUnit));
    if ((item.unit === null && all.length !== 1) || (item.unit !== null && matches.length !== 1)) return { kind: "NEEDS_MEASURE_DISAMBIGUATION", foodName: item.foodName, food, candidates: matches.length ? matches : all, item };
    const candidate = matches[0] ?? all[0];
    if (!candidate || !Number.isFinite(candidate.measure.carbohydrates) || !Number.isFinite(candidate.measure.servingQuantity)) return { kind: "NEEDS_MEASURE_DISAMBIGUATION", foodName: item.foodName, food, candidates: all, item };
    return { kind: "RESOLVED", item: this.toResolvedItem(item, food, candidate.measure), candidate };
  }
  private async resolveLegacy(item: InterpretedItem): Promise<SelectionOutcome> {
    const repo = this.legacyRepo!; const key = normalizeKey(item.foodName);
    let food = (await repo.findFoodByAliasExact(key)) ?? (await repo.findFoodByNameExact(key));
    if (!food) { const foods = await repo.findFoodCandidates(key); if (!foods.length) return { kind: "UNRESOLVED", foodName: item.foodName }; if (foods.length !== 1) return { kind: "NEEDS_FOOD_DISAMBIGUATION", foodName: item.foodName, candidateSet: { term: item.foodName, normalizedKey: key, candidates: [], distinctFoodCount: foods.length }, saturated: false }; food = foods[0]!; }
    const candidates = (await repo.findMeasuresByFoodId(food.id)).map((measure) => ({ candidateId: `${food!.id}:${measure.id}`, food: food!, measure, matchLevel: "EXACT" as const }));
    if (!candidates.length) return { kind: "UNRESOLVED", foodName: item.foodName };
    return this.resolveMeasure(item, food, candidates);
  }
  private toResolvedItem(item: InterpretedItem, food: Food, measure: FoodMeasure): ResolvedItem { return { foodName: food.name, quantity: item.quantity ?? Number.NaN, quantityMode: item.unit === null ? "WEIGHT" : "SERVINGS", unit: measure.servingUnit, carbsPerServing: measure.carbohydrates, servingQuantity: measure.servingQuantity, foodId: food.id }; }
}

/** Accepts singular/plural units against database labels such as "1 xícara de café". */
function matchesMeasureUnit(informedUnit: string, measureLabel: string): boolean {
  const unit = singularize(normalizeKey(informedUnit));
  const label = normalizeKey(measureLabel).replace(/^\s*(?:\d+(?:[.,]\d+)?|\d+\/\d+)\s*/, "");
  return label === unit || label.startsWith(`${unit} `) || label.includes(` ${unit} `);
}

function singularize(value: string): string {
  return value.split(" ").map((word) => word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word).join(" ");
}
