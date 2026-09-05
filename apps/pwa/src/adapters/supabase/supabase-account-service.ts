import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccountService } from "../../application";

export class SupabaseAccountService implements AccountService {
  public constructor(private readonly client: SupabaseClient) {}

  public async deleteAccount(confirmation: "EXCLUIR"): Promise<void> {
    const { error } = await this.client.functions.invoke("delete-account", { body: { confirmation } });
    if (error) throw new Error("Não foi possível excluir sua conta. Tente novamente.");
    await this.client.auth.signOut({ scope: "local" });
  }
}
