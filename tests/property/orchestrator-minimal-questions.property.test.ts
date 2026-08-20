// tests/property/orchestrator-minimal-questions.property.test.ts
//
// Teste de propriedade — perguntas mínimas por informação ausente ou ambígua.
//
// Feature: glicia, Property 13: Perguntas mínimas por informação ausente ou ambígua
//
// O ConversationOrchestrator pergunta APENAS o que falta: ele NUNCA solicita um
// dado que já foi fornecido de forma não ambígua (Req 11.6). E quando TODOS os
// dados estão presentes e não ambíguos, a primeira resposta é o resumo de
// confirmação, e NÃO uma pergunta (Req 11.5).
//
// Estratégia:
//   - Geram-se 4 booleanos independentes indicando quais campos estão PRESENTES
//     vs AUSENTES: glicemia?, tipo de refeição?, alimento (resolvível)? e
//     quantidade do alimento?.
//   - Constrói-se uma MealInterpretation roteirada coerente com esses booleanos
//     (glucose número|null; meal LUNCH|null; items com "arroz" resolvível — com
//     quantidade número|null — ou vazio; missingInformation consistente).
//   - O repositório em memória é semeado com "arroz" para que resolva por nome
//     exato (Req 4.4).
//   - Um orquestrador + canal NOVOS por execução recebem UMA mensagem (uma chave
//     fixa mapeada no interpretador roteirado). Inspeciona-se getSent()[0].
//
// Asserções:
//   - Todos presentes → a 1ª mensagem é o resumo de confirmação (contém
//     "Total de carboidratos") e NÃO é uma pergunta por campo já fornecido.
//   - Caso contrário → a 1ª mensagem corresponde a um campo AUSENTE. Como o
//     orquestrador pergunta em ordem fixa de prioridade
//     (GLUCOSE → MEAL → FOOD → FOOD_QUANTITY), a pergunta deve ser exatamente o
//     PRIMEIRO campo ausente nessa ordem — nunca um campo já presente.
//
// Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.6

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { ConversationOrchestrator } from "../../src/domain/conversation/orchestrator.js";
import { FoodResolver } from "../../src/domain/foods/food-resolver.js";
import { MockInterpreter } from "../../src/adapters/interpreter-mock/mock-interpreter.js";
import {
  InMemoryRepository,
  InMemoryChannel,
} from "../../src/adapters/persistence/in-memory-repository.js";
import type {
  MealInterpretation,
  MissingInfo,
} from "../../src/domain/types.js";

// Campo perguntado por uma resposta de saída, inferido pela redação em
// português usada pelo orquestrador em `nextPrompt`. Retorna "NONE" quando a
// mensagem não é uma pergunta por um campo (ex.: resumo de confirmação).
type AskedField = "GLUCOSE" | "MEAL" | "FOOD" | "FOOD_QUANTITY" | "NONE";

// Mapeia a primeira resposta de saída ao campo perguntado, casando substrings
// EXCLUSIVAS da redação do orquestrador (ver `nextPrompt` em orchestrator.ts):
//   - "glicemia"          → GLUCOSE  ("Qual é a sua glicemia agora (mg/dL)?")
//   - "tipo de refeição"  → MEAL     ("Qual é o tipo de refeição? ...")
//   - "quantidade"        → FOOD_QUANTITY ("Qual a quantidade de: ...?")
//   - "alimento"          → FOOD     ("Quais alimentos ..." / "... esse(s) alimento(s)?")
// As redações não se sobrepõem: nenhuma pergunta casa mais de um marcador.
function classifyPrompt(text: string): AskedField {
  if (text.includes("glicemia")) return "GLUCOSE";
  if (text.includes("tipo de refeição")) return "MEAL";
  if (text.includes("quantidade")) return "FOOD_QUANTITY";
  if (text.includes("alimento")) return "FOOD";
  return "NONE";
}

// Primeiro campo ausente na ordem de prioridade do orquestrador
// (GLUCOSE → MEAL → FOOD → FOOD_QUANTITY), ou null quando nada falta. Espelha a
// lógica de `computeMissing`/`nextPrompt` para o cenário desta propriedade:
// FOOD_QUANTITY só é relevante quando há alimento resolvido sem quantidade.
function firstMissingField(
  hasGlucose: boolean,
  hasMeal: boolean,
  hasFood: boolean,
  hasQuantity: boolean,
): AskedField | null {
  if (!hasGlucose) return "GLUCOSE";
  if (!hasMeal) return "MEAL";
  if (!hasFood) return "FOOD";
  if (!hasQuantity) return "FOOD_QUANTITY"; // aqui hasFood === true
  return null; // todos presentes
}

describe("Feature: glicia, Property 13: Perguntas mínimas por informação ausente ou ambígua", () => {
  // Texto de entrada fixo, usado como chave do interpretador roteirado.
  const INPUT = "mensagem de teste";

  it("a primeira resposta pergunta apenas o primeiro campo ausente; com tudo presente, confirma sem perguntar (Req 11.1–11.4, 11.6)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        async (hasGlucose, hasMeal, hasFood, hasQuantity) => {
          // MealInterpretation roteirada, coerente com os 4 booleanos.
          const items = hasFood
            ? [
                {
                  foodName: "arroz",
                  quantity: hasQuantity ? 3 : null,
                  unit: null,
                },
              ]
            : [];

          const missingInformation: MissingInfo[] = [];
          if (!hasGlucose) missingInformation.push("GLUCOSE");
          if (!hasMeal) missingInformation.push("MEAL");
          if (!hasFood) missingInformation.push("FOOD");
          if (hasFood && !hasQuantity) missingInformation.push("FOOD_QUANTITY");

          const interpretation: MealInterpretation = {
            glucose: hasGlucose ? 165 : null,
            meal: hasMeal ? "LUNCH" : null,
            items,
            missingInformation,
          };

          // Interpretador roteirado determinístico: INPUT → interpretation.
          const interpreter = new MockInterpreter(
            new Map<string, MealInterpretation>([[INPUT, interpretation]]),
          );

          // Repositório com "arroz" semeado, resolvível por nome exato (Req 4.4).
          const repo = new InMemoryRepository();
          repo.addFoodWithMeasure({
            name: "arroz",
            servingUnit: "colher",
            servingQuantity: 25,
            carbohydrates: 6.2,
            active: true,
          });

          const resolver = new FoodResolver(repo);
          const channel = new InMemoryChannel();
          const orchestrator = new ConversationOrchestrator(
            interpreter,
            resolver,
            repo,
            channel,
            () => new Date(),
          );

          // Liga o canal ao domínio e envia uma única mensagem.
          channel.onMessage((msg) => orchestrator.handleInbound(msg));
          await channel.receive(INPUT);

          const sent = channel.getSent();
          expect(sent.length).toBeGreaterThan(0);
          const first = sent[0]!;

          const expected = firstMissingField(
            hasGlucose,
            hasMeal,
            hasFood,
            hasQuantity,
          );

          if (expected === null) {
            // Tudo presente e não ambíguo → resumo de confirmação, sem pergunta
            // por campo já fornecido (Req 11.5, 11.6).
            expect(first).toContain("Total de carboidratos");
            // NÃO pode ser uma pergunta por um campo já fornecido.
            expect(classifyPrompt(first)).toBe("NONE");
          } else {
            // Falta algo → a 1ª resposta pergunta EXATAMENTE o primeiro campo
            // ausente na ordem de prioridade, nunca um campo já presente.
            const asked = classifyPrompt(first);
            expect(asked).toBe(expected);

            // Reforço explícito de 11.6: o campo perguntado é de fato ausente.
            const presentByField: Record<
              Exclude<AskedField, "NONE">,
              boolean
            > = {
              GLUCOSE: hasGlucose,
              MEAL: hasMeal,
              FOOD: hasFood,
              FOOD_QUANTITY: hasFood && hasQuantity,
            };
            expect(presentByField[expected]).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
