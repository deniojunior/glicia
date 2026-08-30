import type { PreferencesRepository } from "../../application";
import type { OnboardingProgress, PersistedPreferences } from "../../domain";

export class MemoryPreferencesRepository implements PreferencesRepository {
  public preferences: PersistedPreferences | null = null;

  public onboarding: OnboardingProgress | null = null;

  public async loadPreferences(): Promise<PersistedPreferences | null> { return this.preferences; }
  public async savePreferences(preferences: PersistedPreferences): Promise<void> { this.preferences = preferences; }
  public async loadOnboardingProgress(): Promise<OnboardingProgress | null> { return this.onboarding; }
  public async saveOnboardingProgress(progress: OnboardingProgress): Promise<void> { this.onboarding = progress; }
  public async clearOnboardingProgress(): Promise<void> { this.onboarding = null; }
}
