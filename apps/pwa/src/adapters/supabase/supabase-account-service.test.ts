import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SupabaseAccountService } from "./supabase-account-service";

describe("SupabaseAccountService", () => {
  it("encerra somente a sessão do dispositivo atual", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { signOut } } as unknown as SupabaseClient;

    await new SupabaseAccountService(client).signOut();

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("informa quando não consegue encerrar a sessão", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: new Error("network") });
    const client = { auth: { signOut } } as unknown as SupabaseClient;

    await expect(new SupabaseAccountService(client).signOut()).rejects.toThrow("Não foi possível sair");
  });

  it("exclui pelo backend e encerra apenas a sessão local depois do sucesso", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { deleted: true }, error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const client = { functions: { invoke }, auth: { signOut } } as unknown as SupabaseClient;

    await new SupabaseAccountService(client).deleteAccount("EXCLUIR");

    expect(invoke).toHaveBeenCalledWith("delete-account", { body: { confirmation: "EXCLUIR" } });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("mantém a sessão quando o backend não confirma a exclusão", async () => {
    const signOut = vi.fn();
    const client = { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: new Error("falha") }) }, auth: { signOut } } as unknown as SupabaseClient;

    await expect(new SupabaseAccountService(client).deleteAccount("EXCLUIR")).rejects.toThrow("Não foi possível excluir");
    expect(signOut).not.toHaveBeenCalled();
  });
});
