import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { AiRequest } from "../../application";
import { SupabaseAiProvider } from "./supabase-ai-provider";

describe("SupabaseAiProvider", () => {
  it("envia o contexto à Edge Function sem receber uma chave de API", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { provider: "openai", model: "gpt-4o-mini", output_text: JSON.stringify({ reply: "Resumo fictício.", total_carbohydrates: 30, glucose: 110, glucose_trend: "ESTAVEL", meal_type: "ALMOCO", food_memory_updates: [] }) },
      error: null
    });
    const client = { functions: { invoke } } as unknown as SupabaseClient;
    const provider = new SupabaseAiProvider(client, () => ({ foodMemory: {}, foodTable: "tabela fictícia" }));
    const request: AiRequest = { message: "almoço fictício", history: [], interaction_mode: "preciso", food_memory: {} };

    const result = await provider.ask(request);

    expect(result.turn.total_carbohydrates).toBe(30);
    expect(result).toMatchObject({ provider: "openai", model: "gpt-4o-mini" });
    expect(invoke).toHaveBeenCalledWith("ai-chat", {
      body: { messages: [{ role: "user", content: "almoço fictício" }], foodMemory: {}, foodTable: "tabela fictícia" }
    });
    expect(JSON.stringify(invoke.mock.calls)).not.toContain("sk-");
  });

  it("classifica uma falha da Edge Function sem expor detalhes do secret", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({ error: "Configuração indisponível." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      }
    });
    const client = { functions: { invoke } } as unknown as SupabaseClient;

    const provider = new SupabaseAiProvider(client, () => ({ foodMemory: {}, foodTable: "tabela fictícia" }));
    await expect(provider.ask({ message: "teste", history: [], interaction_mode: "preciso", food_memory: {} }))
      .rejects.toThrow("Configuração indisponível");
  });
});
