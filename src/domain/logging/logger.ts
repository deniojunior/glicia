// src/domain/logging/logger.ts
//
// Logger seguro — sem dados clínicos (Req 15.4, 15.5).
//
// Princípio de privacidade: nenhum dado clínico (glicemia, alimentos,
// quantidades, doses ou conteúdo de mensagem) pode ser registrado em log.
// Isso é garantido ESTRUTURALMENTE: o tipo LogEvent é fechado/exato e permite
// APENAS os campos operacionais autorizados. Qualquer tentativa de logar um
// campo fora desse conjunto é rejeitada em tempo de compilação, tornando
// impossível vazar dados clínicos por engano (validado pela Property 27).
//
// A implementação da Fase 1 é simples e livre de dependências: emite o evento
// como uma linha JSON via console.log, sem rede nem IO externo.

// Conjunto EXATO de campos permitidos em um evento de log (Req 15.4).
// Nomeados em camelCase para consistência com o restante do domínio.
export interface LogEvent {
  /** Identificador da mensagem de origem (ex.: external_message_id). */
  readonly messageId: string;
  /** Identificador da paciente associada ao evento. */
  readonly patientId: string;
  /** Tipo do evento, ex.: "MESSAGE_RECEIVED", "MEAL_PERSISTED". */
  readonly eventType: string;
  /** Resultado do evento, ex.: "OK", "ERROR". */
  readonly status: string;
  /** Tempo de processamento em milissegundos. */
  readonly processingTime: number;
  /** Momento do evento em ISO-8601. */
  readonly timestamp: string;
  /** Identificador de correlação para rastrear o fluxo. */
  readonly correlationId: string;
}

// Utilitário de exatidão: força um tipo a NÃO conter chaves além das de LogEvent.
// Marca qualquer chave extra como `never`, o que faz a atribuição de um objeto
// com campos adicionais (ex.: glucose, dose, foodName) falhar na compilação,
// mesmo quando o valor vem de uma variável (não apenas de literais de objeto).
type ExactLogEvent<T> = LogEvent & Record<Exclude<keyof T, keyof LogEvent>, never>;

// Contrato do logger. O método `log` é genérico e restrito ao formato exato de
// LogEvent, impedindo estruturalmente o registro de campos não autorizados.
export interface Logger {
  log<T extends LogEvent>(event: ExactLogEvent<T>): void;
}

// Cria um Logger simples que emite cada evento como uma linha JSON.
// Sem dependências, sem rede: adequado para a Fase 1 (MVP local).
export function createConsoleLogger(
  sink: (line: string) => void = (line) => console.log(line),
): Logger {
  return {
    log<T extends LogEvent>(event: ExactLogEvent<T>): void {
      // Reconstrói o payload a partir apenas dos campos autorizados. Assim,
      // mesmo que o objeto de entrada carregasse propriedades extras em tempo
      // de execução, elas nunca seriam serializadas para o log (Req 15.5).
      const safe: LogEvent = {
        messageId: event.messageId,
        patientId: event.patientId,
        eventType: event.eventType,
        status: event.status,
        processingTime: event.processingTime,
        timestamp: event.timestamp,
        correlationId: event.correlationId,
      };
      sink(JSON.stringify(safe));
    },
  };
}
