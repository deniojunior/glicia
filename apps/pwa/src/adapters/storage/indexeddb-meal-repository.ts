import type { FoodMemoryRepository, MealHistoryRepository, MealRecord } from "../../application";

const DATABASE_NAME = "glicia";
const STORE_NAME = "meals";
const MEMORY_KEY = "food-memory";

export class IndexedDbMealRepository implements MealHistoryRepository, FoodMemoryRepository {
  public async saveRecord(record: MealRecord): Promise<void> { await this.put(record, record.id); }
  public async list(): Promise<readonly MealRecord[]> { return (await this.values<MealRecord>()).sort((a, b) => b.created_at.localeCompare(a.created_at)); }
  public async load(): Promise<Readonly<Record<string, string>>> { return (await this.get<Record<string, string>>(MEMORY_KEY)) ?? {}; }
  public async saveMemory(memory: Readonly<Record<string, string>>): Promise<void> { await this.put(memory, MEMORY_KEY); }
  private open(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(DATABASE_NAME, 2); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); if (!request.result.objectStoreNames.contains("preferences")) request.result.createObjectStore("preferences"); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o histórico local.")); }); }
  private async put(value: unknown, key: string): Promise<void> { const db = await this.open(); await request(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(value, key)); db.close(); }
  private async get<T>(key: string): Promise<T | null> { const db = await this.open(); const value = await request<T | undefined>(db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key)); db.close(); return value ?? null; }
  private async values<T>(): Promise<T[]> { const db = await this.open(); const values = await request<T[]>(db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll()); db.close(); return values.filter((value) => typeof value === "object" && value !== null && "id" in value); }
}

function request<T>(value: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? new Error("Não foi possível salvar o histórico.")); }); }
