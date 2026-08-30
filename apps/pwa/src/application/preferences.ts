import type { OnboardingProgress, PersistedPreferences } from "../domain";

export interface PreferencesRepository {
  loadPreferences(): Promise<PersistedPreferences | null>;
  savePreferences(preferences: PersistedPreferences): Promise<void>;
  loadOnboardingProgress(): Promise<OnboardingProgress | null>;
  saveOnboardingProgress(progress: OnboardingProgress): Promise<void>;
  clearOnboardingProgress(): Promise<void>;
}

export class PreferencesService {
  public constructor(private readonly repository: PreferencesRepository) {}

  public load(): Promise<PersistedPreferences | null> {
    return this.repository.loadPreferences();
  }

  public save(preferences: PersistedPreferences): Promise<void> {
    return this.repository.savePreferences(preferences);
  }

  public loadOnboarding(): Promise<OnboardingProgress | null> {
    return this.repository.loadOnboardingProgress();
  }

  public saveOnboarding(progress: OnboardingProgress): Promise<void> {
    return this.repository.saveOnboardingProgress(progress);
  }

  public clearOnboarding(): Promise<void> {
    return this.repository.clearOnboardingProgress();
  }
}
