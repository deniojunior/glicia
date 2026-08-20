import { describe, expect, it } from "vitest";
import { OpenAiMealAssistant } from "../../src/adapters/openai-meal-assistant/openai-meal-assistant.js";

function response(id: string, output: unknown): Response {
  return new Response(JSON.stringify({ id, output_text: JSON.stringify(output) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenAiMealAssistant", () => {
  it("delega a conversa à LLM e encadeia os turnos pela resposta anterior", async () => {
    const requests: unknown[] = [];
    const outputs = [
      response("resp-1", {
        reply: "Qual é sua glicemia e a tendência?",
        carbohydrates: 29,
        glucose: null,
        glucoseTrend: null,
        meal: "BREAKFAST",
        ready: false,
      }),
      response("resp-2", {
        reply: "Resumo pronto: 29 g de carboidratos, glicemia 160 em subida.",
        carbohydrates: 29,
        glucose: 160,
        glucoseTrend: "RISING",
        meal: "BREAKFAST",
        ready: true,
      }),
    ];
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return outputs.shift()!;
    }) as typeof fetch;
    const assistant = new OpenAiMealAssistant({
      apiKey: "test-key",
      fetchImpl,
      foodCatalog: "Pão francês: 1 unidade (50 g, 29 g CHO)",
    });

    const first = await assistant.reply("vou tomar café com pão");
    const second = await assistant.reply("glicemia 160, subindo");

    expect(first.ready).toBe(false);
    expect(second).toMatchObject({ carbohydrates: 29, glucose: 160, glucoseTrend: "RISING", meal: "BREAKFAST", ready: true });
    expect(requests).toHaveLength(2);
    const firstRequest = requests[0] as { instructions: string; previous_response_id?: string };
    const secondRequest = requests[1] as { previous_response_id?: string };
    expect(firstRequest.instructions).toContain("SKILL 2 — Contagem");
    expect(firstRequest.instructions).toContain("Pão francês");
    expect(firstRequest.previous_response_id).toBeUndefined();
    expect(secondRequest.previous_response_id).toBe("resp-1");
  });
});
