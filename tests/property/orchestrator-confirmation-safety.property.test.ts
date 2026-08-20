// tests/property/orchestrator-confirmation-safety.property.test.ts
//
// Teste de propriedade — segurança da confirmação.
//
// Feature: glicia, Property 15: Segurança da confirmação
//
// Req 6.3: apenas uma confirmação AFIRMATIVA EXPLÍCITA prossegue ao cálculo
// determinístico de insulina.
// Req 6.4: se a paciente rejeita, solicita correção, ou fornece qualquer
// resposta que NÃO seja uma confirmação afirmativa explícita, o
// Conversation_Orchestrator SHALL abster-se de executar o cálculo de insulina e
// de persistir a refeição.
//
// A propriedade valida que, tendo a conversa chegado a WAITING_CONFIRMATION com
// uma interpretação completa e resolvível, qualquer resposta que NÃO seja uma
// confirmação afirmativa explícita:
//   - NÃO persiste nenhuma refeição (repo.getMeals().length === 0);
//   - NÃO reporta dose calculada ("Dose calculada:" nunca é enviada).
//
// Estratégia: cada execução usa instâncias FRESCAS (repo/canal/orquestrador).
// Um MockInterpreter roteirizado mapeia UMA mensagem COMPLETA fixa a uma
// interpretação completa e resolvível (glicemia, almoço, 1 item "arroz" qty 3,
// sem faltantes). O repositório é semeado para "arroz" resolver. Enviar a
// mensagem completa dirige a conversa a WAITING_CONFIRMATION — precondição de
// cada execução. Em seguida envia-se UMA resposta não-afirmativa e verifica-se a
// ausência de persistência. Em WAITING_CONFIRMATION o orquestrador CLASSIFICA a
// resposta (não a interpreta), então respostas arbitrárias são seguras de enviar.
// Um contraste positivo ("sim") prova que a guarda não bloqueia trivialmente.
//
// Validates: Requirements 6.4

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  InMemoryChannel,
  InMemoryRepository,
} from "../../src/adapters/persistence/in-memory-repository.js";
import { MockInterpreter } from "../../src/adapters/interpreter-mock/mock-interpreter.js";
import { FoodResolver } from "../../src/domain/foods/food-resolver.js";
import { ConversationOrchestrator } from "../../src/domain/conversation/orchestrator.js";
import type { MealInterpretation } from "../../src/domain/types.js";

// Mensagem completa fixa que o interpretador roteirizado reconhece.
const COMPLETE_MESSAGE = "glicemia 120, almoço 3 colheres de arroz";

// Interpretação completa e resolvível associada à mensagem completa:
// glicemia presente, almoço (LUNCH), um item "arroz" (qty 3), sem faltantes.
const COMPLETE_INTERPRETATION: MealInterpretation = {
  glucose: 120,
  meal: "LUNCH",
  items: [{ foodName: "arroz", quantity: 3, unit: "colheres" }],
  missingInformation: [],
};

// Tokens de confirmação afirmativa EXPLÍCITA (espelham AFFIRMATIVE_TOKENS do
// orquestrador). Uma resposta é "não-afirmativa" quando NENHUM de seus tokens
// (tokenizados em não-letras) pertence a este conjunto.
const AFFIRMATIVE_TOKENS: ReadonlySet<string> = new Set([
  "sim",
  "s",
  "yes",
  "y",
  "confirmo",
  "confirmar",
  "confirmado",
  "confirma",
  "isso",
  "correto",
  "correta",
  "certo",
  "ok",
  "okay",
  "positivo",
  "claro",
  "exato",
  "exatamente",
  "pode",
]);

// Tokeniza em palavras minúsculas preservando acentos do português, do mesmo
// modo que o orquestrador classifica a confirmação.
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^0-9a-záàâãéêíóôõúüç]+/i)
    .filter((token) => token.length > 0);
}

// Verdadeiro quando algum token isolado é uma confirmação afirmativa.
function containsAffirmative(text: string): boolean {
  return tokenize(text).some((token) => AFFIRMATIVE_TOKENS.has(token));
}

// Constrói instâncias frescas e dirige a conversa a WAITING_CONFIRMATION
// enviando a mensagem completa. Retorna o repositório e o canal para inspeção.
async function driveToWaitingConfirmation(): Promise<{
  repo: InMemoryRepository;
  channel: InMemoryChannel;
}> {
  const repo = new InMemoryRepository();
  // Semeia "arroz" (identidade + medida única) para que o item resolva contra o
  // Food_Database. A servingUnit "colheres" casa exatamente com item.unit da
  // interpretação completa, tornando a resolução da medida RESOLVED.
  repo.addFoodWithMeasure({
    name: "arroz",
    servingUnit: "colheres",
    servingQuantity: 20,
    carbohydrates: 6,
    active: true,
  });

  const scripted = new Map<string, MealInterpretation>([
    [COMPLETE_MESSAGE, COMPLETE_INTERPRETATION],
  ]);
  const interpreter = new MockInterpreter(scripted);
  const resolver = new FoodResolver(repo);
  const channel = new InMemoryChannel();
  // Relógio constante: a janela de 10 min nunca expira dentro de uma execução.
  const clock = (): Date => new Date("2024-01-01T00:00:00.000Z");
  const orchestrator = new ConversationOrchestrator(
    interpreter,
    resolver,
    repo,
    channel,
    clock,
  );
  channel.onMessage((msg) => orchestrator.handleInbound(msg));

  // Envia a mensagem completa → apresenta para confirmação (WAITING_CONFIRMATION).
  await channel.receive(COMPLETE_MESSAGE);

  return { repo, channel };
}

// Verdadeiro quando alguma resposta enviada reporta a dose calculada.
function reportedCalculatedDose(sent: readonly string[]): boolean {
  return sent.some((message) => message.includes("Dose calculada"));
}

describe("Feature: glicia, Property 15: Segurança da confirmação", () => {
  it("resposta não-afirmativa em WAITING_CONFIRMATION não calcula nem persiste (Req 6.4)", async () => {
    // Gerador de respostas NÃO-afirmativas: palavras curadas de rejeição/
    // correção/ambiguidade OU strings aleatórias, filtrando qualquer texto que
    // contenha um token afirmativo isolado.
    const nonAffirmativeReply = fc
      .oneof(
        fc.constantFrom(
          "talvez",
          "não",
          "nao",
          "quem sabe",
          "muda",
          "corrigir",
          "espera",
          "depois",
          "hmm",
          "sei lá",
          "não sei",
          "?",
          "123",
          "aleatório",
          "outra coisa",
        ),
        fc.string({ maxLength: 40 }),
      )
      .filter((text) => !containsAffirmative(text));

    await fc.assert(
      fc.asyncProperty(nonAffirmativeReply, async (reply) => {
        // Precondição por execução: instâncias frescas em WAITING_CONFIRMATION.
        const { repo, channel } = await driveToWaitingConfirmation();

        // Sanidade da precondição: nada persistido e prompt de confirmação exibido.
        expect(repo.getMeals().length).toBe(0);
        const sentAfterDrive = channel.getSent();
        expect(
          sentAfterDrive[sentAfterDrive.length - 1] ?? "",
        ).toContain("Confirme os dados da refeição");

        // Envia UMA resposta não-afirmativa.
        await channel.receive(reply);

        // Garantia central (Req 6.4): nenhuma refeição persistida...
        expect(repo.getMeals().length).toBe(0);
        // ...e nenhuma dose calculada reportada.
        expect(reportedCalculatedDose(channel.getSent())).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("contraste positivo: 'sim' confirma, calcula e persiste exatamente uma refeição (Req 6.3)", async () => {
    const { repo, channel } = await driveToWaitingConfirmation();
    expect(repo.getMeals().length).toBe(0);

    // Confirmação afirmativa explícita.
    await channel.receive("sim");

    // A guarda não é trivialmente bloqueante: uma refeição é persistida e a
    // dose calculada é reportada.
    expect(repo.getMeals().length).toBe(1);
    expect(reportedCalculatedDose(channel.getSent())).toBe(true);
  });
});
