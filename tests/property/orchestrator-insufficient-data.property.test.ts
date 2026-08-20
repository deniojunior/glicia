// tests/property/orchestrator-insufficient-data.property.test.ts
//
// Teste de propriedade — guarda de dados insuficientes.
//
// Feature: glicia, Property 14: Guarda de dados insuficientes
//
// Req 17.3: IF não houver informação suficiente para calcular (glicemia, tipo
// de refeição, alimento ou quantidade ausentes), THEN o Conversation_Orchestrator
// SHALL informar à paciente que faltam dados e abster-se de calcular.
// Req 6.4: qualquer resposta que não seja confirmação afirmativa explícita não
// dispara cálculo nem persistência.
//
// A propriedade valida que, para uma interpretação INCOMPLETA arbitrária (ao
// menos um dentre glicemia / tipo de refeição / alimento / quantidade ausente),
// não importa o que a paciente responda em seguida — inclusive um "sim" que
// tentaria forçar o cálculo — o orquestrador NUNCA persiste uma refeição
// (`repo.getMeals()` permanece vazio) e NUNCA reporta uma dose calculada
// (nenhuma mensagem enviada contém "Dose calculada"). Ele apenas continua
// pedindo o que falta, sem jamais chegar à confirmação + cálculo.
//
// Estratégia:
//   - 4 booleanos (glicemia/refeição/alimento/quantidade presentes) com a
//     restrição de que NEM todos são verdadeiros (portanto sempre falta algo).
//   - Um `MockInterpreter` com roteiro que mapeia a mensagem inicial para a
//     interpretação incompleta correspondente, e mapeia "sim" para uma
//     interpretação sem dados (não completa nada).
//   - O `InMemoryRepository` é semeado com o alimento "arroz" para que, quando
//     o alimento estiver presente, ele resolva a exatamente um Food.
//   - Orquestrador/canal novos por execução (estado isolado).
//   - Envia a mensagem inicial (incompleta) e depois "sim".
//   - Assere `repo.getMeals().length === 0` e ausência de "Dose calculada".
//
// Validates: Requirements 17.3, 6.4

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ConversationOrchestrator } from "../../src/domain/conversation/orchestrator.js";
import { FoodResolver } from "../../src/domain/foods/food-resolver.js";
import { MockInterpreter } from "../../src/adapters/interpreter-mock/mock-interpreter.js";
import {
  InMemoryChannel,
  InMemoryRepository,
} from "../../src/adapters/persistence/in-memory-repository.js";
import type {
  MealInterpretation,
  MissingInfo,
} from "../../src/domain/types.js";

// Texto da mensagem inicial (chave do roteiro do MockInterpreter). Distinto de
// "sim" para não colidir no mapa de roteiro.
const INITIAL_TEXT = "registro inicial";

// Constrói a interpretação incompleta correspondente aos 4 flags de presença.
// - glicemia presente → 165, senão null (Req 3.3);
// - refeição presente → LUNCH, senão null (Req 3.4);
// - alimento presente → item "arroz" (resolve a exatamente um Food);
//   quantidade presente → 3, senão null (Req 3.5, 5.6);
// - alimento ausente → nenhum item (FOOD ausente — Req 4.8/11.3).
function buildInterpretation(
  glucosePresent: boolean,
  mealPresent: boolean,
  foodPresent: boolean,
  quantityPresent: boolean,
): MealInterpretation {
  const glucose = glucosePresent ? 165 : null;
  const meal = mealPresent ? "LUNCH" : null;
  const items = foodPresent
    ? [
        {
          foodName: "arroz",
          quantity: quantityPresent ? 3 : null,
          unit: "colheres" as string | null,
        },
      ]
    : [];

  const missingInformation: MissingInfo[] = [];
  if (!glucosePresent) missingInformation.push("GLUCOSE");
  if (!mealPresent) missingInformation.push("MEAL");
  if (!foodPresent) missingInformation.push("FOOD");
  if (foodPresent && !quantityPresent) missingInformation.push("FOOD_QUANTITY");

  return { glucose, meal, items, missingInformation };
}

// Interpretação "vazia" para "sim": nenhum dado extraível, tudo ausente. Assim,
// mesmo em estado ACTIVE, o "sim" não completa nenhum dado (Req 3.8).
const EMPTY_INTERPRETATION: MealInterpretation = {
  glucose: null,
  meal: null,
  items: [],
  missingInformation: ["GLUCOSE", "MEAL", "FOOD_QUANTITY", "FOOD"],
};

describe("Feature: glicia, Property 14: Guarda de dados insuficientes", () => {
  it("com dados incompletos, nenhuma resposta (nem 'sim') dispara persistência ou dose calculada (Req 17.3, 6.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 4 flags de presença com a restrição de que NEM todos são true (ao
        // menos um dado sempre falta → interpretação incompleta).
        fc
          .tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean())
          .filter(
            ([g, m, f, q]) => !(g && m && f && q),
          ),
        // Uma resposta afirmativa arbitrária dentre variações de "sim".
        fc.constantFrom("sim", "Sim", "sim!", "sim, confirmo"),
        async ([glucosePresent, mealPresent, foodPresent, quantityPresent], affirmative) => {
          // Roteiro determinístico: mensagem inicial → interpretação incompleta;
          // qualquer "sim" → interpretação vazia (não completa nada).
          const scripted = new Map<string, MealInterpretation>();
          scripted.set(
            INITIAL_TEXT,
            buildInterpretation(
              glucosePresent,
              mealPresent,
              foodPresent,
              quantityPresent,
            ),
          );
          scripted.set(affirmative, EMPTY_INTERPRETATION);

          // Building blocks novos por execução (estado isolado).
          const repo = new InMemoryRepository();
          // Semeia "arroz" para que o alimento presente resolva a um único Food.
          repo.addFood({
            name: "arroz",
            defaultServingUnit: "colher",
            defaultServingQuantity: 20,
            carbohydrates: 5,
            active: true,
          });

          const channel = new InMemoryChannel();
          const interpreter = new MockInterpreter(scripted);
          const resolver = new FoodResolver(repo);
          const orchestrator = new ConversationOrchestrator(
            interpreter,
            resolver,
            repo,
            channel,
            () => new Date(),
          );
          channel.onMessage((msg) => orchestrator.handleInbound(msg));

          // 1) Mensagem inicial incompleta → orquestrador pergunta o que falta.
          await channel.receive(INITIAL_TEXT);
          // 2) Tenta forçar o cálculo com uma afirmação — ainda incompleto.
          await channel.receive(affirmative);

          // Guarda de dados insuficientes: nada foi persistido (Req 17.3).
          expect(repo.getMeals().length).toBe(0);

          // Nenhuma dose calculada foi reportada (Req 17.3, 6.4).
          const sent = channel.getSent();
          expect(sent.some((message) => message.includes("Dose calculada"))).toBe(
            false,
          );
          // Reforço: a refeição nunca foi registrada como concluída.
          expect(
            sent.some((message) =>
              message.includes("Refeição registrada com sucesso"),
            ),
          ).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
