import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { AiRequest } from "../../application";
import { storeOpenAiConnection, SupabaseAiProvider } from "./supabase-ai-provider";

describe("SupabaseAiProvider", () => {
  it("envia o contexto à Edge Function sem receber uma chave de API", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { output_text: JSON.stringify({ reply: "Resumo fictício.", total_carbohydrates: 30, glucose: 110, glucose_trend: "ESTAVEL", meal_type: "ALMOCO", food_memory_updates: [] }) },
      error: null
    });
    const client = { functions: { invoke } } as unknown as SupabaseClient;
    const provider = new SupabaseAiProvider(client, () => "instruções fictícias");
    const request: AiRequest = { message: "almoço fictício", history: [], interaction_mode: "preciso", food_memory: {} };

    const turn = await provider.ask(request);

    expect(turn.total_carbohydrates).toBe(30);
    expect(invoke).toHaveBeenCalledWith("ai-chat", {
      body: { messages: [{ role: "user", content: "almoço fictício" }], instructions: "instruções fictícias" }
    });
    expect(JSON.stringify(invoke.mock.calls)).not.toContain("sk-");
  });

  it("preserva a mensagem segura devolvida ao rejeitar uma chave", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({ code: "invalid_openai_key", error: "A chave OpenAI não foi aceita." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }
    });
    const client = { functions: { invoke } } as unknown as SupabaseClient;

    await expect(storeOpenAiConnection(client, "chave-ficticia", "modelo-ficticio"))
      .rejects.toThrow("A chave OpenAI não foi aceita.");
  });
});
