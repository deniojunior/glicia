import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";

import {
  TerminalChannel,
  validateMessage,
  externalMessageIdFor,
  MIN_MESSAGE_LENGTH,
  MAX_MESSAGE_LENGTH,
} from "../../src/adapters/terminal/terminal-channel.js";
import type { InboundMessage } from "../../src/domain/ports/channel-adapter.js";

// Testes unitários do TerminalChannel (Requisito 1: 1.2, 1.3).
//
// Estratégia:
//  - validateMessage / externalMessageIdFor: funções puras testadas diretamente.
//  - Comportamento de encaminhamento: dirigimos o adaptador via `processLine`,
//    registrando um handler que coleta as InboundMessages recebidas. Assim
//    verificamos que mensagens inválidas NÃO são encaminhadas (Req 1.2, 1.3) e
//    que mensagens válidas são encaminhadas integralmente (Req 1.4).
//  - send: usamos um stream de saída injetável (PassThrough) para capturar o
//    texto escrito no terminal (Req 1.5).

// --- Helpers ---

/** Cria um TerminalChannel com saída capturável e um coletor de mensagens. */
function makeChannel() {
  const output = new PassThrough();
  let outText = "";
  output.on("data", (chunk: Buffer) => {
    outText += chunk.toString("utf8");
  });

  const channel = new TerminalChannel({ output });
  const received: InboundMessage[] = [];
  channel.onMessage(async (msg) => {
    received.push(msg);
  });

  return { channel, received, getOutput: () => outText };
}

// --- validateMessage (Req 1.2, 1.3) ---

describe("validateMessage", () => {
  it("rejeita string vazia (Req 1.2)", () => {
    expect(validateMessage("").ok).toBe(false);
  });

  it("rejeita mensagem composta só por espaços (Req 1.2)", () => {
    expect(validateMessage("   ").ok).toBe(false);
    expect(validateMessage("\t\n").ok).toBe(false);
  });

  it("aceita um único caractere (Req 1.1)", () => {
    expect(validateMessage("a").ok).toBe(true);
  });

  it("aceita uma mensagem no limite de 4000 caracteres (Req 1.1)", () => {
    const at = "a".repeat(MAX_MESSAGE_LENGTH);
    expect(at.length).toBe(4000);
    expect(validateMessage(at).ok).toBe(true);
  });

  it("rejeita uma mensagem com 4001 caracteres (acima do limite) (Req 1.3)", () => {
    const over = "a".repeat(MAX_MESSAGE_LENGTH + 1);
    expect(over.length).toBe(4001);
    const result = validateMessage(over);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("4000");
    }
  });

  it("aceita uma mensagem normal (Req 1.1)", () => {
    expect(
      validateMessage("Minha glicemia está 165 e vou jantar arroz.").ok,
    ).toBe(true);
  });

  it("expõe limites coerentes", () => {
    expect(MIN_MESSAGE_LENGTH).toBe(1);
    expect(MAX_MESSAGE_LENGTH).toBe(4000);
  });
});

// --- externalMessageIdFor (Req 13.3) ---

describe("externalMessageIdFor", () => {
  it("é determinístico: mesmo texto + mesmo contador → mesmo id", () => {
    expect(externalMessageIdFor("arroz", 0)).toBe(
      externalMessageIdFor("arroz", 0),
    );
  });

  it("contador diferente → id diferente", () => {
    expect(externalMessageIdFor("arroz", 0)).not.toBe(
      externalMessageIdFor("arroz", 1),
    );
  });

  it("texto diferente → id diferente", () => {
    expect(externalMessageIdFor("arroz", 0)).not.toBe(
      externalMessageIdFor("feijão", 0),
    );
  });

  it("sessão diferente → id diferente, mesmo texto e contador", () => {
    expect(externalMessageIdFor("arroz", 0, "sessao-a")).not.toBe(
      externalMessageIdFor("arroz", 0, "sessao-b"),
    );
  });

  it("produz um hash hexadecimal não vazio", () => {
    const id = externalMessageIdFor("arroz", 0);
    expect(id.length).toBeGreaterThan(0);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });
});

// --- Comportamento via processLine (Req 1.2, 1.3, 1.4) ---

describe("TerminalChannel.processLine", () => {
  it("NÃO encaminha mensagem vazia ao handler (Req 1.2)", async () => {
    const { channel, received } = makeChannel();
    await channel.processLine("");
    expect(received).toHaveLength(0);
  });

  it("NÃO encaminha mensagem só com espaços ao handler (Req 1.2)", async () => {
    const { channel, received } = makeChannel();
    await channel.processLine("   ");
    expect(received).toHaveLength(0);
  });

  it("encaminha mensagem válida uma vez com texto íntegro e id não vazio (Req 1.4)", async () => {
    const { channel, received } = makeChannel();
    await channel.processLine("valid message");

    expect(received).toHaveLength(1);
    expect(received[0].text).toBe("valid message");
    expect(received[0].externalMessageId.length).toBeGreaterThan(0);
  });

  it("NÃO encaminha mensagem acima de 4000 caracteres (Req 1.3)", async () => {
    const { channel, received } = makeChannel();
    await channel.processLine("a".repeat(MAX_MESSAGE_LENGTH + 1));
    expect(received).toHaveLength(0);
  });

  it("exibe uma indicação de erro ao rejeitar entrada inválida (Req 1.2)", async () => {
    const { channel, getOutput } = makeChannel();
    await channel.processLine("");
    expect(getOutput().length).toBeGreaterThan(0);
  });

  it("gera ids distintos para a mesma mensagem submetida duas vezes na sessão", async () => {
    const { channel, received } = makeChannel();
    await channel.processLine("mesma mensagem");
    await channel.processLine("mesma mensagem");

    expect(received).toHaveLength(2);
    expect(received[0].externalMessageId).not.toBe(
      received[1].externalMessageId,
    );
  });
});

// --- send (Req 1.5) ---

describe("TerminalChannel.send", () => {
  it("escreve o texto integral da resposta na saída (Req 1.5)", async () => {
    const { channel, getOutput } = makeChannel();
    await channel.send("resposta do domínio");
    expect(getOutput()).toContain("resposta do domínio");
  });
});
