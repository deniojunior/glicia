import { describe, expect, it, vi } from "vitest";

import type { AiRequest } from "../../application";
import { OpenAIResponsesProvider } from "./openai-responses-provider";

const request: AiRequest = { message: "Arroz; 120 mg/dL, estável, almoço", history: [], interaction_mode: "preciso", food_memory: {} };
const payload = { id: "resp-1", output_text: JSON.stringify({ reply: "Resumo.", total_carbohydrates: 42, glucose: 120, glucose_trend: "ESTAVEL", meal_type: "ALMOCO", food_memory_updates: [] }) };

describe("OpenAIResponsesProvider", () => {
  it("envia schema estruturado, não armazena a resposta e guarda o id somente no adaptador", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    const provider = new OpenAIResponsesProvider({ apiKey: "chave-ficticia", model: "modelo-ficticio", instructions: "instruções", fetcher });
    await provider.ask(request);
    await provider.ask(request);
    const firstBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(firstBody.store).toBe(false);
    expect(firstBody.text.format.type).toBe("json_schema");
    expect(firstBody.previous_response_id).toBeUndefined();
    expect(secondBody.previous_response_id).toBe("resp-1");
  });

  it("classifica falha de autenticação sem expor a chave", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    const provider = new OpenAIResponsesProvider({ apiKey: "chave-secreta", model: "modelo", instructions: "", fetcher });
    await expect(provider.ask(request)).rejects.toMatchObject({ code: "authentication", retryable: false });
  });
});
