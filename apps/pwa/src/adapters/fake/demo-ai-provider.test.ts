import { describe, expect, it } from "vitest";

import type { AiRequest } from "../../application";
import { DemoAiProvider } from "./demo-ai-provider";

const firstMessage: AiRequest = {
  message: "Arroz, frango e salada; 120 mg/dL, seta estável, almoço",
  history: [],
  interaction_mode: "preciso",
  food_memory: {}
};

describe("DemoAiProvider", () => {
  it("fecha o resumo a partir da primeira mensagem completa", async () => {
    const result = await new DemoAiProvider().ask(firstMessage);

    expect(result).toMatchObject({
      provider: "demo",
      model: "deterministic",
      turn: {
        total_carbohydrates: 42,
        glucose: 120,
        glucose_trend: "ESTAVEL",
        meal_type: "ALMOCO"
      }
    });
  });
});
