// src/app/main.ts
//
// Entrypoint da CLI do Glicia (Fase 1 — MVP Local). Fino de propósito: compõe
// a aplicação via `buildApp` sobre um TerminalChannel (stdin/stdout) e inicia o
// loop de conversa. 100% offline — NENHUMA chamada de rede (Req 1.7, 20.6).
//
// A composição real vive em `wiring.ts`; aqui apenas orquestramos o ciclo de
// vida do processo (welcome, start, e stop no encerramento).

import { buildApp } from "./wiring.js";

// Mensagem de boas-vindas (Req 19). Curta e sem dados clínicos.
const WELCOME = process.env.GLICIA_INTERPRETER === "openai"
  ? "Glicia — assistente de contagem de carboidratos e glicemia com IA. Descreva o que pretende comer."
  : "Glicia — assistente de registro glicêmico (offline). " +
    'Descreva sua refeição, glicemia e tendencia da glicose. Digite "cancelar" para recomeçar.';

async function main(): Promise<void> {
  const app = buildApp();

  // Encerramento limpo: para o canal e fecha o repositório (Req 1.7).
  const shutdown = (): void => {
    void app.stop().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.stdout.write(`${WELCOME}\n`);
  await app.start();
}

// Executa apenas quando invocado diretamente como binário (não em import/teste).
if (process.argv[1] !== undefined) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Erro fatal ao iniciar o Glicia: ${message}\n`);
    process.exit(1);
  });
}
