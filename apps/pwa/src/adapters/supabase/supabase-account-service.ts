import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccountService } from "../../application";

export class SupabaseAccountService implements AccountService {
  public constructor(private readonly client: SupabaseClient) {}

  public async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error) throw new Error("Não foi possível sair neste dispositivo. Tente novamente.");
  }

  public async deleteAccount(confirmation: "EXCLUIR"): Promise<void> {
    const { error } = await this.client.functions.invoke("delete-account", { body: { confirmation } });
    if (error) throw new Error("Não foi possível excluir sua conta. Tente novamente.");
    await this.signOut();
  }
}
