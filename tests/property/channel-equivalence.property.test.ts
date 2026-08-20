// tests/property/channel-equivalence.property.test.ts
//
// Teste de propriedade — equivalência entre canais.
//
// Feature: glicia, Property 28: Equivalência entre canais
//
// Req 2.4: onde a implementação de canal é substituída por outra que cumpre o
// contrato Channel_Adapter, o Glicia_System SHALL produzir as MESMAS respostas
// de domínio para conteúdo textual equivalente.
//
// O domínio consome exclusivamente texto e produz texto (Req 2.1). Portanto,
// para uma MESMA sequência de mensagens de entrada, dois canais que apenas
// diferem na IMPLEMENTAÇÃO do contrato Channel_Adapter devem observar a MESMA
// sequência de respostas de domínio (os arrays de getSent() devem ser iguais).
//
// Estratégia:
//   - Geram-se 4 booleanos independentes indicando quais campos estão PRESENTES
//     (glicemia?, tipo de refeição?, alimento resolvível?, quantidade?). A
//     partir deles monta-se uma MealInterpretation roteirada coerente, variando
//     assim qual pergunta/fluxo o orquestrador exercita a cada execução.
//   - Constroem-se DOIS stacks idênticos que diferem SOMENTE na implementação
//     do canal: um sobre `InMemoryChannel` (fixture do projeto) e outro sobre
//     `SecondChannel` (definido neste arquivo, estruturalmente diferente:
//     guarda as saídas em um Map indexado por ordem e usa um esquema de
//     externalMessageId próprio). Cada stack tem repositório/orquestrador NOVOS
//     e alimentos semeados de forma idêntica, de modo que estado não vaze.
//   - Ambos os canais recebem a MESMA sequência de mensagens, com o MESMO
//     externalMessageId explícito por mensagem, para que a idempotência (Req 13)
//     se comporte de forma idêntica independentemente do esquema de id do canal.
//   - Usa-se um relógio fixo idêntico nos dois stacks (janela de confirmação
//     determinística — Req 6.6).
//
// Asserção:
//   - channelB.getSent() deep-equals channelA.getSent(): as respostas de domínio
//     (textos) são idênticas, provando que a equivalência não está atrelada a
//     uma implementação específica de canal. O externalMessageId pode diferir
//     entre canais; o que importa é a resposta de domínio (texto).
//
// Validates: Requirements 2.4

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
  ChannelAdapter,
  InboundMessage,
} from "../../src/domain/ports/channel-adapter.js";
import type {
  MealInterpretation,
  MissingInfo,
} from "../../src/domain/types.js";

type DomainHandler = (msg: InboundMessage) => Promise<void>;

/**
 * SecondChannel — uma SEGUNDA implementação do contrato `ChannelAdapter`,
 * funcionalmente equivalente ao `InMemoryChannel`, porém ESTRUTURALMENTE
 * diferente:
 *   - guarda as respostas de saída em um `Map<number, string>` indexado pela
 *     ordem de envio (em vez de um array simples), reconstruindo a sequência em
 *     `getSent()`;
 *   - usa um esquema de `externalMessageId` próprio/distinto quando nenhum id
 *     explícito é fornecido (Req 13.3).
 *
 * O objetivo é provar que a equivalência de respostas de domínio (Req 2.4) não
 * está atrelada aos detalhes internos de uma implementação de canal.
 */
class SecondChannel implements ChannelAdapter {
  private handler: DomainHandler | undefined;
  // Estrutura de saída deliberadamente diferente do InMemoryChannel.
  private readonly outbox = new Map<number, string>();
  private sendSeq = 0;
  private receiveSeq = 0;

  onMessage(handler: DomainHandler): void {
    this.handler = handler;
  }

  async send(text: string): Promise<void> {
    this.outbox.set(this.sendSeq, text);
    this.sendSeq += 1;
  }

  async start(): Promise<void> {
    // no-op — canal de teste sem loop de leitura.
  }

  async stop(): Promise<void> {
    // no-op.
  }

  /** Acessor de teste: respostas textuais enviadas, na ordem de envio (Req 1.5). */
  getSent(): string[] {
    return [...this.outbox.keys()]
      .sort((a, b) => a - b)
      .map((key) => this.outbox.get(key)!);
  }

  /**
   * receive — injeta uma mensagem inbound encaminhando-a ao handler registrado
   * (Req 1.4). Quando `externalMessageId` é omitido, gera um id determinístico
   * com esquema PRÓPRIO (distinto do InMemoryChannel) para dedupe (Req 13.3).
   */
  async receive(text: string, externalMessageId?: string): Promise<void> {
    if (!this.handler) {
      throw new Error("Nenhum handler registrado via onMessage.");
    }
    const id = externalMessageId ?? `second-channel#${this.receiveSeq}#${text}`;
    this.receiveSeq += 1;
    await this.handler({ externalMessageId: id, text });
  }
}

// Canal de teste que cumpre o contrato ChannelAdapter e expõe getSent()/receive().
type TestChannel = ChannelAdapter & {
  getSent(): string[];
  receive(text: string, externalMessageId?: string): Promise<void>;
};

// Texto de entrada fixo, usado como chave do interpretador roteirado.
const INPUT = "mensagem de teste";

// Relógio fixo idêntico para ambos os stacks (janela de confirmação — Req 6.6).
const FIXED_NOW = new Date("2024-01-01T12:00:00.000Z");

/**
 * Constrói um stack de domínio completo (repositório + resolver + orquestrador)
 * ligado a um canal específico, semeando "arroz" de forma idêntica em todos os
 * stacks (resolvível por nome exato — Req 4.4). Difere entre chamadas SOMENTE
 * na implementação do canal recebida.
 */
function buildStack(channel: TestChannel, interpretation: MealInterpretation): void {
  const interpreter = new MockInterpreter(
    new Map<string, MealInterpretation>([[INPUT, interpretation]]),
  );

  const repo = new InMemoryRepository();
  repo.addFood({
    name: "arroz",
    defaultServingUnit: "colher",
    defaultServingQuantity: 25,
    carbohydrates: 6.2,
    active: true,
  });

  const resolver = new FoodResolver(repo);
  const orchestrator = new ConversationOrchestrator(
    interpreter,
    resolver,
    repo,
    channel,
    () => FIXED_NOW,
  );

  channel.onMessage((msg) => orchestrator.handleInbound(msg));
}

describe("Feature: glicia, Property 28: Equivalência entre canais", () => {
  it("dois canais que cumprem o contrato produzem as MESMAS respostas de domínio para o mesmo texto (Req 2.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        async (hasGlucose, hasMeal, hasFood, hasQuantity) => {
          // MealInterpretation roteirada, coerente com os 4 booleanos. Varia
          // qual fluxo/pergunta o orquestrador exercita a cada execução.
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

          // MESMA sequência de mensagens para ambos os canais, com ids
          // explícitos IDÊNTICOS (idempotência idêntica — Req 13). O follow-up
          // "sim" leva o fluxo à confirmação/persistência quando tudo está
          // presente, e a mais uma iteração determinística caso contrário.
          const messages: ReadonlyArray<{ text: string; id: string }> = [
            { text: INPUT, id: "msg-1" },
            { text: "sim", id: "msg-2" },
          ];

          // Stack A — sobre InMemoryChannel.
          const channelA = new InMemoryChannel();
          buildStack(channelA, interpretation);
          for (const message of messages) {
            await channelA.receive(message.text, message.id);
          }

          // Stack B — sobre SecondChannel (implementação distinta do contrato).
          const channelB = new SecondChannel();
          buildStack(channelB, interpretation);
          for (const message of messages) {
            await channelB.receive(message.text, message.id);
          }

          // As respostas de domínio (textos) devem ser idênticas (Req 2.4).
          expect(channelB.getSent()).toEqual(channelA.getSent());
          // Sanidade: houve efetivamente respostas de domínio a comparar.
          expect(channelA.getSent().length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
