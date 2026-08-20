// src/adapters/terminal/terminal-channel.ts
//
// TerminalChannel — adaptador de canal para o MVP Local (Req 1).
//
// Implementa a porta ChannelAdapter (Req 1.6, 2.2) sobre um REPL de linha
// baseado em `node:readline`. O domínio consome apenas texto e produz texto;
// este adaptador é 100% offline, sem qualquer chamada de rede (Req 1.7).
//
// Responsabilidades:
//  - Ler linhas do terminal (ou de streams injetáveis, para testes).
//  - Validar cada linha (Req 1.1–1.3): rejeitar vazias/só espaços e > 4000
//    caracteres, exibindo erro e aguardando nova entrada, SEM encaminhar ao
//    handler de domínio.
//  - Encaminhar o conteúdo íntegro de mensagens válidas ao handler (Req 1.4).
//  - Exibir a resposta íntegra produzida pelo domínio (Req 1.5).
//
// Deduplicação (Req 13.3):
//  O terminal não possui um identificador de mensagem nativo (como o WhatsApp,
//  Req 13.4). Aplicamos um mecanismo equivalente: cada mensagem aceita recebe um
//  `externalMessageId` DETERMINÍSTICO derivado de um hash SHA-256 do conteúdo
//  combinado com um UUID de sessão e contador monotônico (iniciado em 0):
//
//      externalMessageId = sha256(sessionId + ":" + counter + ":" + text)
//
//  Propriedades desse esquema:
//   - Determinístico dentro da sessão: o trio (sessionId, counter, text)
//     sempre produz o mesmo id, de modo que reprocessar exatamente a mesma
//     InboundMessage é idempotente e é deduplicado pela restrição de unicidade
//     do repositório (Req 13.1, 13.2).
//   - Distinção entre submissões: digitar o mesmo texto duas vezes na sessão
//     gera ids distintos (o contador avança), pois são mensagens intencionais
//     distintas — não devem ser tratadas como duplicata. O UUID evita colisões
//     com conversas de execuções anteriores do terminal.

import { createInterface, type Interface } from 'node:readline';
import { createHash, randomUUID } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import type {
  ChannelAdapter,
  InboundMessage,
} from '../../domain/ports/channel-adapter.js';

/** Comprimento mínimo aceito de uma mensagem, em caracteres (Req 1.1). */
export const MIN_MESSAGE_LENGTH = 1;
/** Comprimento máximo aceito de uma mensagem, em caracteres (Req 1.1, 1.3). */
export const MAX_MESSAGE_LENGTH = 4000;

/** Resultado da validação pura de uma mensagem de entrada. */
export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * validateMessage — função pura de validação de entrada (Req 1.1–1.3).
 *
 * Regras:
 *  - Rejeita mensagens vazias ou compostas apenas por espaços em branco
 *    (Req 1.2).
 *  - Rejeita mensagens com mais de MAX_MESSAGE_LENGTH caracteres (Req 1.3).
 *  - Aceita mensagens com 1..MAX_MESSAGE_LENGTH caracteres não totalmente em
 *    branco (Req 1.1). O conteúdo é preservado íntegro (sem trim) para
 *    encaminhamento (Req 1.4); o `trim` é usado apenas para detectar vazio.
 */
export function validateMessage(text: string): ValidationResult {
  if (text.trim().length < MIN_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: 'Mensagem vazia. Digite ao menos 1 caractere que não seja espaço em branco.',
    };
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Mensagem muito longa (${text.length} caracteres). O limite é ${MAX_MESSAGE_LENGTH} caracteres.`,
    };
  }
  return { ok: true };
}

/**
 * externalMessageIdFor — gera o identificador determinístico de dedupe do
 * terminal (Req 13.3). Ver o cabeçalho do arquivo para o esquema completo.
 */
export function externalMessageIdFor(
  text: string,
  counter: number,
  sessionId = 'terminal',
): string {
  return createHash('sha256').update(`${sessionId}:${counter}:${text}`).digest('hex');
}

/** Opções de construção do TerminalChannel (todas com padrões sensatos). */
export interface TerminalChannelOptions {
  /** Stream de entrada (padrão: process.stdin). Injetável para testes. */
  input?: Readable;
  /** Stream de saída (padrão: process.stdout). Injetável para testes. */
  output?: Writable;
  /** Prompt exibido antes de cada leitura (padrão: "> "). */
  prompt?: string;
}

type DomainHandler = (msg: InboundMessage) => Promise<void>;

export class TerminalChannel implements ChannelAdapter {
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly promptText: string;

  private rl: Interface | undefined;
  private handler: DomainHandler | undefined;

  /** Contador de sessão monotônico usado no externalMessageId (Req 13.3). */
  private counter = 0;
  /** Evita colisões de ids de mensagens entre duas execuções do terminal. */
  private readonly sessionId = randomUUID();

  constructor(options: TerminalChannelOptions = {}) {
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
    this.promptText = options.prompt ?? '> ';
  }

  // Registra o handler de domínio (Req 1.6, 2.2).
  onMessage(handler: DomainHandler): void {
    this.handler = handler;
  }

  // Exibe o conteúdo integral da resposta do domínio no terminal (Req 1.5).
  async send(text: string): Promise<void> {
    this.writeLine(text);
  }

  // Inicia a interface readline e emite o primeiro prompt.
  async start(): Promise<void> {
    if (this.rl) return;

    const rl = createInterface({
      input: this.input,
      output: this.output,
      terminal: false,
    });
    this.rl = rl;

    rl.on('line', (line: string) => {
      // Serializa o processamento: pausa a entrada enquanto o handler roda e a
      // retoma ao final, garantindo ordem e um novo prompt por mensagem.
      rl.pause();
      void this.processLine(line)
        .catch((err: unknown) => {
          this.writeLine(`⚠️  Erro ao processar mensagem: ${this.describeError(err)}`);
        })
        .finally(() => {
          rl.resume();
          this.prompt();
        });
    });

    this.prompt();
  }

  // Encerra a interface readline e libera recursos.
  async stop(): Promise<void> {
    this.rl?.close();
    this.rl = undefined;
  }

  /**
   * processLine — processa uma única linha de entrada. Público para permitir
   * que testes unitários e de propriedade dirijam o adaptador sem depender de
   * um stream real, mantendo intacto o contrato ChannelAdapter.
   *
   * Fluxo (Req 1.2–1.4):
   *  - Se inválida, exibe erro e retorna sem encaminhar ao handler.
   *  - Se válida, gera o externalMessageId determinístico (Req 13.3) e
   *    encaminha o texto íntegro ao handler registrado (Req 1.4).
   */
  async processLine(line: string): Promise<void> {
    const result = validateMessage(line);
    if (!result.ok) {
      this.writeLine(`⚠️  ${result.error}`);
      return;
    }

    const externalMessageId = externalMessageIdFor(line, this.counter, this.sessionId);
    this.counter += 1;

    const message: InboundMessage = { externalMessageId, text: line };
    if (this.handler) {
      await this.handler(message);
    }
  }

  private prompt(): void {
    this.output.write(this.promptText);
  }

  private writeLine(text: string): void {
    this.output.write(`${text}\n`);
  }

  private describeError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
