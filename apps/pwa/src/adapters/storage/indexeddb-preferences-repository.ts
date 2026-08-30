import type { OnboardingProgress, PersistedPreferences } from "../../domain";
import type { PreferencesRepository } from "../../application";

const DATABASE_NAME = "glicia";
const STORE_NAME = "preferences";
const PREFERENCES_KEY = "settings";
const ONBOARDING_KEY = "onboarding";

export class IndexedDbPreferencesRepository implements PreferencesRepository {
  public async loadPreferences(): Promise<PersistedPreferences | null> {
    return this.read<PersistedPreferences>(PREFERENCES_KEY);
  }

  public savePreferences(preferences: PersistedPreferences): Promise<void> {
    return this.write(PREFERENCES_KEY, preferences);
  }

  public async loadOnboardingProgress(): Promise<OnboardingProgress | null> {
    return this.read<OnboardingProgress>(ONBOARDING_KEY);
  }

  public saveOnboardingProgress(progress: OnboardingProgress): Promise<void> {
    return this.write(ONBOARDING_KEY, progress);
  }

  public async clearOnboardingProgress(): Promise<void> {
    const database = await this.open();
    await transaction(database, "readwrite", (store) => store.delete(ONBOARDING_KEY));
    database.close();
  }

  private async read<T>(key: string): Promise<T | null> {
    const database = await this.open();
    const value = await transaction<T | undefined>(database, "readonly", (store) => store.get(key));
    database.close();
    return value ?? null;
  }

  private async write(key: string, value: unknown): Promise<void> {
    const database = await this.open();
    await transaction(database, "readwrite", (store) => store.put(value, key));
    database.close();
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir os dados locais."));
    });
  }
}

function transaction<T>(database: IDBDatabase, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = operation(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível salvar os dados locais."));
  });
}
