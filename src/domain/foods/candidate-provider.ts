import type { Food, FoodMeasure, Repository } from "../ports/repository.js";
import { normalizeKey, tokenize } from "./normalizer.js";

export const MAX_CANDIDATES = 25;
export type MatchLevel = "EXACT" | "PREFIX" | "SUBSTRING";
export interface FoodCandidate { candidateId: string; food: Food; measure: FoodMeasure; matchLevel: MatchLevel; }
export interface CandidateSet { term: string; normalizedKey: string; candidates: FoodCandidate[]; distinctFoodCount: number; }

const levelRank: Record<MatchLevel, number> = { EXACT: 0, PREFIX: 1, SUBSTRING: 2 };

export class CandidateProvider {
  constructor(private readonly repo: Pick<Repository, "listActiveFoodEntries">) {}

  async candidatesFor(term: string): Promise<CandidateSet> {
    const normalizedKey = normalizeKey(term);
    if (!normalizedKey) return { term, normalizedKey, candidates: [], distinctFoodCount: 0 };
    const tokens = tokenize(normalizedKey);
    const candidates: FoodCandidate[] = [];
    for (const entry of await this.repo.listActiveFoodEntries()) {
      const nameKey = normalizeKey(entry.food.name);
      const searchable = [nameKey, ...entry.aliases.map(normalizeKey)];
      if (!tokens.every((token) => searchable.some((value) => value.includes(token)))) continue;
      const matchLevel: MatchLevel = nameKey === normalizedKey ? "EXACT" : nameKey.startsWith(normalizedKey) ? "PREFIX" : "SUBSTRING";
      for (const measure of entry.measures) candidates.push({ candidateId: `${entry.food.id}:${measure.id}`, food: entry.food, measure, matchLevel });
    }
    candidates.sort((a, b) => levelRank[a.matchLevel] - levelRank[b.matchLevel]
      || normalizeKey(a.food.name).length - normalizeKey(b.food.name).length
      || normalizeKey(a.food.name).localeCompare(normalizeKey(b.food.name))
      || a.food.id.localeCompare(b.food.id) || a.measure.id.localeCompare(b.measure.id));
    const limited = candidates.slice(0, MAX_CANDIDATES);
    return { term, normalizedKey, candidates: limited, distinctFoodCount: new Set(limited.map((candidate) => candidate.food.id)).size };
  }

  /** Active catalogue used only by an optional conversational discovery adapter. */
  async activeEntries() {
    return this.repo.listActiveFoodEntries();
  }

  /** Resolve uma preferência persistida sem reabrir a busca textual. */
  async candidateForIds(foodId: string, measureId: string): Promise<FoodCandidate | null> {
    const entry = (await this.repo.listActiveFoodEntries()).find((value) => value.food.id === foodId);
    const measure = entry?.measures.find((value) => value.id === measureId);
    return entry && measure
      ? { candidateId: `${entry.food.id}:${measure.id}`, food: entry.food, measure, matchLevel: "EXACT" }
      : null;
  }
}
