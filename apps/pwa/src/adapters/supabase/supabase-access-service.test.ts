import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SupabaseAccessService } from "./supabase-access-service";

describe("SupabaseAccessService", () => {
  it("envia a solicitação sem tentar criar uma conta Auth", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { accepted: true }, error: null });
    const signInWithOtp = vi.fn();
    const client = { functions: { invoke }, auth: { signInWithOtp } } as unknown as SupabaseClient;

    await new SupabaseAccessService(client).requestAccess("piloto@example.test");

    expect(invoke).toHaveBeenCalledWith("request-access", { body: { email: "piloto@example.test" } });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("usa magic link somente no caminho de login aprovado", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { signInWithOtp } } as unknown as SupabaseClient;

    await new SupabaseAccessService(client).sendLoginLink("piloto@example.test", "https://glicia.test/");

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "piloto@example.test",
      options: { emailRedirectTo: "https://glicia.test/" }
    });
  });

  it("converte a fila administrativa para o contrato da aplicação", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { requests: [{ id: "request-1", email_normalized: "piloto@example.test", status: "pending", request_count: 2, requested_at: "2026-08-31T10:00:00Z", last_requested_at: "2026-08-31T11:00:00Z", reviewed_at: null, user_id: null }] },
      error: null
    });
    const client = { functions: { invoke } } as unknown as SupabaseClient;

    const requests = await new SupabaseAccessService(client).listAccessRequests();

    expect(requests).toEqual([{ id: "request-1", email: "piloto@example.test", status: "pending", requestCount: 2, requestedAt: "2026-08-31T10:00:00Z", lastRequestedAt: "2026-08-31T11:00:00Z", reviewedAt: null, userId: null }]);
  });
});

