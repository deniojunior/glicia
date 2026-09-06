import type { SupabaseClient } from "@supabase/supabase-js";

import type { PreferencesRepository } from "../../application";
import { createOnboardingProgress, type OnboardingProgress, type PersistedPreferences } from "../../domain";

type PreferenceRow = {
  version: number;
  clinical_settings: PersistedPreferences["clinical_settings"];
  interaction_mode: PersistedPreferences["interaction_mode"];
  onboarding_progress: OnboardingProgress | null;
};

export class SupabasePreferencesRepository implements PreferencesRepository {
  public constructor(private readonly client: SupabaseClient, private readonly userId: string) {}

  public async loadPreferences(): Promise<PersistedPreferences | null> {
    const row = await this.loadRow();
    if (!row || row.onboarding_progress !== null) return null;
    return { version: 1, clinical_settings: row.clinical_settings, interaction_mode: "preciso" };
  }

  public async savePreferences(preferences: PersistedPreferences): Promise<void> {
    await this.upsert({
      version: preferences.version,
      clinical_settings: preferences.clinical_settings,
      interaction_mode: "preciso"
    });
  }

  public async loadOnboardingProgress(): Promise<OnboardingProgress | null> {
    const row = await this.loadRow();
    return row?.onboarding_progress ? createOnboardingProgress(row.onboarding_progress) : null;
  }

  public async saveOnboardingProgress(progress: OnboardingProgress): Promise<void> {
    await this.upsert({
      version: progress.version,
      clinical_settings: progress.clinical_settings,
      interaction_mode: "preciso",
      onboarding_progress: createOnboardingProgress(progress)
    });
  }

  public async clearOnboardingProgress(): Promise<void> {
    const { error } = await this.client.from("user_preferences").update({ onboarding_progress: null, onboarding_completed_at: new Date().toISOString() }).eq("user_id", this.userId);
    if (error) throw new Error("Não foi possível concluir a configuração da conta.");
  }

  private async loadRow(): Promise<PreferenceRow | null> {
    const { data, error } = await this.client.from("user_preferences").select("version, clinical_settings, interaction_mode, onboarding_progress").eq("user_id", this.userId).maybeSingle();
    if (error) throw new Error("Não foi possível carregar as configurações da conta.");
    return data as PreferenceRow | null;
  }

  private async upsert(values: Record<string, unknown>): Promise<void> {
    const { error } = await this.client.from("user_preferences").upsert({ user_id: this.userId, ...values }, { onConflict: "user_id" });
    if (error) throw new Error("Não foi possível salvar as configurações da conta.");
  }
}
