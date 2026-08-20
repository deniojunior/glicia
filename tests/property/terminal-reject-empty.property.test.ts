import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PassThrough } from "node:stream";

import {
  TerminalChannel,
  validateMessage,
} from "../../src/adapters/terminal/terminal-channel.js";
import type { InboundMessage } from "../../src/domain/ports/channel-adapter.js";

/**
 * Teste de propriedade — rejeição de mensagens vazias ou só com espaços.
 *
 * Feature: glicia, Property 26: Rejeição de mensagens vazias ou só com espaços
 *
 * Para QUALQUER string composta exclusivamente por caracteres de espaço em
 * branco (espaço, tab, \n, \r, \f, \v), incluindo a string vazia, o
 * TerminalChannel deve (Req 1.2):
 *   - `validateMessage(s).ok === false` — a validação pura rejeita a entrada; e
 *   - `processLine(s)` NÃO encaminha a mensagem ao handler registrado — nenhuma
 *     InboundMessage chega ao domínio.
 *
 * Como contraste (para delimitar a fronteira da propriedade), verifica-se que
 * uma string claramente NÃO-branca (a mesma entrada prefixada com "a") é aceita
 * pela validação (`validateMessage(...).ok === true`).
 *
 * A saída de erro é capturada/suprimida por um stream injetável (PassThrough),
 * mantendo o teste silencioso e sem depender de streams reais do terminal.
 *
 * Validates: Requirements 1.2
 */
describe("Feature: glicia, Property 26: Rejeição de mensagens vazias ou só com espaços", () => {
  // Conjunto de caracteres de espaço em branco cobertos pela propriedade.
  const WHITESPACE_CHARS = [" ", "\t", "\n", "\r", "\f", "\v"];

  // Gerador de strings compostas SOMENTE por espaço em branco, incluindo "".
  // fc.array com minLength 0 cobre a string vazia; o charset é restrito aos
  // caracteres de whitespace acima.
  const whitespaceOnly: fc.Arbitrary<string> = fc
    .array(fc.constantFrom(...WHITESPACE_CHARS), { minLength: 0, maxLength: 50 })
    .map((chars) => chars.join(""));

  /** Cria um canal com saída suprimida (PassThrough) e um coletor de mensagens. */
  function makeChannel() {
    const output = new PassThrough();
    // Drena a saída para evitar backpressure; o conteúdo é descartado.
    output.on("data", () => {});

    const channel = new TerminalChannel({ output });
    const received: InboundMessage[] = [];
    channel.onMessage(async (msg) => {
      received.push(msg);
    });

    return { channel, received };
  }

  it("valida como inválida e NÃO encaminha strings só de espaços em branco (Req 1.2)", async () => {
    await fc.assert(
      fc.asyncProperty(whitespaceOnly, async (blank) => {
        // A string gerada realmente só contém whitespace (garante o espaço amostral).
        expect(blank.trim()).toBe("");

        // 1) A validação pura rejeita a entrada (Req 1.2).
        expect(validateMessage(blank).ok).toBe(false);

        // 2) processLine não encaminha nada ao handler (Req 1.2).
        const { channel, received } = makeChannel();
        await channel.processLine(blank);
        expect(received).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it("contraste: uma string não-branca (prefixada com \"a\") é aceita (delimita a fronteira)", () => {
    fc.assert(
      fc.property(whitespaceOnly, (blank) => {
        const nonBlank = `a${blank}`;
        expect(validateMessage(nonBlank).ok).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
