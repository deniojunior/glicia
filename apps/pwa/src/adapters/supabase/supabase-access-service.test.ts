import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SupabaseAccessService } from "./supabase-access-service";

describe("SupabaseAccessService", () => {
  it("consulta o estado antes de criar conta ou solicitação", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { state: "pending" }, error: null });
    const signInWithOtp = vi.fn();
    const client = { functions: { invoke }, auth: { signInWithOtp } } as unknown as SupabaseClient;

    await expect(new SupabaseAccessService(client).checkAccess("piloto@example.test"))
      .resolves.toBe("pending");
    expect(invoke).toHaveBeenCalledWith("request-access", {
      body: { email: "piloto@example.test", action: "check" }
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("registra uma solicitação somente depois da confirmação", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { accepted: true }, error: null });
    const client = { functions: { invoke } } as unknown as SupabaseClient;

    await new SupabaseAccessService(client).requestAccess("piloto@example.test");

    expect(invoke).toHaveBeenCalledWith("request-access", {
      body: { email: "piloto@example.test", action: "request" }
    });
  });

  it("envia e verifica OTP dentro da aplicação", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { sent: true }, error: null });
    const signInWithOtp = vi.fn();
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    const client = { functions: { invoke }, auth: { signInWithOtp, verifyOtp } } as unknown as SupabaseClient;
    const service = new SupabaseAccessService(client);

    await expect(service.sendLoginCode("piloto@example.test", "https://glicia.test/admin")).resolves.toBe("code");
    await service.verifyLoginCode("piloto@example.test", "12345678");

    expect(invoke).toHaveBeenCalledWith("request-access", {
      body: { email: "piloto@example.test", action: "login_code", redirectTo: "https://glicia.test/admin" }
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "piloto@example.test",
      token: "12345678",
      type: "email"
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("usa magic link como contingência quando a entrega do código falha", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: new Error("delivery_failed") });
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    const client = { functions: { invoke }, auth: { signInWithOtp } } as unknown as SupabaseClient;

    await expect(new SupabaseAccessService(client).sendLoginCode("piloto@example.test", "https://glicia.test/"))
      .resolves.toBe("magic_link");
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "piloto@example.test",
      options: { shouldCreateUser: true, emailRedirectTo: "https://glicia.test/" }
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
