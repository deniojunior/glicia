// tests/property/conversation-messages.property.test.ts
//
// Teste de propriedade — registro de mensagens da conversa.
//
// Feature: glicia, Property 24: Registro de mensagens da conversa
//
// Req 16.5: quando uma mensagem é recebida ou enviada, o sistema SHALL
// registrar um conversation_message com direction (INBOUND ou OUTBOUND),
// message_type e content.
//
// A propriedade valida que, para uma sequência ARBITRÁRIA de mensagens (cada
// uma com direction INBOUND/OUTBOUND, message_type TEXT/AUDIO, content string
// arbitrária e external_message_id string|null), anexadas a uma conversa via
// `SqliteRepository.appendConversationMessage`, a leitura das linhas
// conversation_message de volta (por uma conexão bruta better-sqlite3) produz
// EXATAMENTE aquelas mensagens, com direction, message_type, content e
// external_message_id preservados, na ordem de inserção, e cada uma vinculada
// ao conversation_id correto.
//
// Estratégia:
//   - Um banco SQLite em ARQUIVO temporário compartilhado é criado em beforeAll
//     (SqliteRepository aplica as migrations: schema + seed da paciente única).
//   - Uma conexão bruta better-sqlite3 ao MESMO arquivo é usada para ler de
//     volta as linhas.
//   - Cada execução da propriedade cria uma conversa NOVA (repo.createConversation())
//     para que os conjuntos de mensagens não se acumulem entre execuções; a
//     leitura ainda é filtrada por conversation_id e ordenada por rowid (ordem
//     de inserção estável em tabelas rowid do SQLite).
//   - Recursos (conexão bruta + arquivos temporários) são liberados em afterAll.
//
// Validates: Requirements 16.5

import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SqliteRepository } from "../../src/adapters/persistence/sqlite-repository.js";
import type { NewConversationMessage } from "../../src/domain/ports/repository.js";

let tempDir: string;
let dbPath: string;
let repo: SqliteRepository;
let raw: Database.Database; // conexão bruta para ler as linhas de volta

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "glicia-conversation-messages-"));
  dbPath = join(tempDir, `${randomUUID()}.db`);

  // Bootstrap: aplica migrations (schema + seed da paciente única).
  repo = new SqliteRepository({ dbPath });

  // Conexão bruta ao MESMO arquivo, usada para ler as mensagens de volta.
  raw = new Database(dbPath);
  raw.pragma("foreign_keys = ON");
});

afterAll(() => {
  try {
    raw.close();
  } catch {
    // ignora
  }
  try {
    repo.close();
  } catch {
    // ignora
  }
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// --- Geradores -------------------------------------------------------------

// Campos de uma mensagem (sem conversationId, preenchido em tempo de execução
// com a conversa criada para aquela execução da propriedade).
type MessageDraft = Omit<NewConversationMessage, "conversationId">;

function messageDraftArb(): fc.Arbitrary<MessageDraft> {
  return fc.record({
    direction: fc.constantFrom<"INBOUND" | "OUTBOUND">("INBOUND", "OUTBOUND"),
    messageType: fc.constantFrom<"TEXT" | "AUDIO">("TEXT", "AUDIO"),
    content: fc.string({ maxLength: 200 }),
    externalMessageId: fc.option(fc.string({ maxLength: 40 }), { nil: null }),
  });
}

// --- Leitura de volta ------------------------------------------------------

interface MessageRow {
  conversation_id: string;
  direction: string;
  message_type: string;
  content: string;
  external_message_id: string | null;
}

describe("Feature: glicia, Property 24: Registro de mensagens da conversa", () => {
  it("anexar mensagens e ler as linhas de volta preserva direction, message_type, content, external_message_id, em ordem e vinculadas ao conversation_id correto (Req 16.5)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(messageDraftArb(), { minLength: 1, maxLength: 12 }),
        async (drafts) => {
          // Conversa nova por execução: evita acúmulo de mensagens entre runs.
          const conversation = await repo.createConversation();

          for (const draft of drafts) {
            await repo.appendConversationMessage({
              conversationId: conversation.id,
              ...draft,
            });
          }

          // Leitura por conexão bruta, filtrada pela conversa e em ordem de
          // inserção (rowid é monotônico em tabelas rowid do SQLite).
          const rows = raw
            .prepare(
              "SELECT conversation_id, direction, message_type, content, external_message_id " +
                "FROM conversation_message WHERE conversation_id = ? ORDER BY rowid",
            )
            .all(conversation.id) as MessageRow[];

          // Contagem exata: nem a mais, nem a menos.
          expect(rows.length).toBe(drafts.length);

          // Igualdade campo a campo, na mesma ordem.
          drafts.forEach((draft, index) => {
            const row = rows[index];
            expect(row.conversation_id).toBe(conversation.id);
            expect(row.direction).toBe(draft.direction);
            expect(row.message_type).toBe(draft.messageType);
            expect(row.content).toBe(draft.content);
            expect(row.external_message_id).toBe(draft.externalMessageId);
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
