// src/domain/ports/channel-adapter.ts
//
// Porta: ChannelAdapter (Req 1.6, 2.2, 2.3).
//
// Contrato único, apenas texto. Terminal e (futuro) WhatsApp são
// implementações intercambiáveis do mesmo contrato. O domínio consome
// exclusivamente conteúdo textual e produz resposta textual.

// Mensagem inbound recebida por um canal.
export interface InboundMessage {
  externalMessageId: string; // dedupe/idempotência (Req 13)
  text: string;
}

export interface ChannelAdapter {
  // Registra o handler de domínio que recebe uma mensagem inbound.
  onMessage(handler: (msg: InboundMessage) => Promise<void>): void;
  // Envia conteúdo textual de volta ao usuário (Req 1.5).
  send(text: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
