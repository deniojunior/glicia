import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import fc from "fast-check";

import {
  TerminalChannel,
  MIN_MESSAGE_LENGTH,
  MAX_MESSAGE_LENGTH,
} from "../../src/adapters/terminal/terminal-channel.js";
import type { InboundMessage } from "../../src/domain/ports/channel-adapter.js";

// Teste de propriedade — Preservação do conteúdo textual pelo canal.
//
// Validates: Requirements 1.4
//
// Req 1.4: ao submeter uma mensagem de texto VÁLIDA (1..4000 caracteres), o
// Terminal_Channel encaminha o CONTEÚDO ÍNTEGRO da mensagem ao domínio —
// byte a byte, sem trim, sem qualquer modificação.
//
// Estratégia:
//  - Geramos mensagens VÁLIDAS: comprimento em [1, 4000] (contagem de unidades
//    UTF-16, coerente com `text.length` usado por `validateMessage`) e que NÃO
//    sejam compostas apenas por espaços em branco (trim não vazio).
//  - Incluímos espaços internos, unicode e pontuação para exercitar a
//    preservação exata (nada de normalização/trim/escape).
//  - Dirigimos o adaptador via `processLine` (público) e capturamos a
//    InboundMessage entregue a um handler de gravação.
//  - Usamos um stream de saída injetável (PassThrough) para suprimir os prompts
//    escritos no terminal, mantendo o teste 100% offline (Req 18.6).
//  - `processLine` é assíncrono, então usamos `fc.asyncProperty`.

/**
 * Gera uma mensagem VÁLIDA para o Terminal_Channel.
 *
 * Combina strings ASCII (com pontuação e espaços internos) e strings unicode
 * completas, filtrando para o espaço de entrada válido:
 *  - `s.length` em [MIN_MESSAGE_LENGTH, MAX_MESSAGE_LENGTH] (Req 1.1)
 *  - `s.trim().length >= 1` (não é vazia nem só-espaços) (Req 1.2 exclui inválidas)
 */
const arbValidMessage: fc.Arbitrary<string> = fc
  .oneof(
    // ASCII amplo: inclui pontuação e espaços internos.
    fc.string({ maxLength: MAX_MESSAGE_LENGTH }),
    // Unicode completo (acentos, emojis, símbolos). maxLength conta code points;
    // o filtro abaixo garante o limite em unidades UTF-16.
    fc.fullUnicodeString({ maxLength: 2000 }),
  )
  .filter(
    (s) =>
      s.trim().length >= MIN_MESSAGE_LENGTH && s.length <= MAX_MESSAGE_LENGTH,
  );

/** Cria um canal com saída descartável (PassThrough) e um handler gravador. */
function makeChannel() {
  const output = new PassThrough();
  // Drena a saída para não acumular buffer (prompts/erros são descartados).
  output.on("data", () => {});

  const channel = new TerminalChannel({ output });
  const received: InboundMessage[] = [];
  channel.onMessage(async (msg) => {
    received.push(msg);
  });

  return { channel, received };
}

describe("Feature: glicia, Property 25: Preservação do conteúdo textual pelo canal", () => {
  it("encaminha ao domínio o texto EXATAMENTE igual ao submetido, sem trim ou modificação (Req 1.4)", async () => {
    await fc.assert(
      fc.asyncProperty(arbValidMessage, async (input) => {
        const { channel, received } = makeChannel();

        await channel.processLine(input);

        // Uma mensagem válida é encaminhada exatamente uma vez (Req 1.4).
        expect(received).toHaveLength(1);
        // O conteúdo entregue é idêntico ao submetido, byte a byte.
        expect(received[0].text).toBe(input);
        // Comprimento preservado (nenhum trim/normalização alterou o texto).
        expect(received[0].text.length).toBe(input.length);
      }),
      { numRuns: 100 },
    );
  });
});
