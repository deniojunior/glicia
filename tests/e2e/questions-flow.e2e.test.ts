// tests/e2e/questions-flow.e2e.test.ts
//
// Teste end-to-end (Fase 1, MVP Local) — fluxo que REQUER perguntas.
//
// Task 15.3 / Requisitos 18.5, 19.5, 11.5.
//
// Princípio arquitetural central:
//   "IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."
//
// Exercita a aplicação COMPOSTA (`buildApp`) 100% offline, sobre um banco
// SQLite em memória (":memory:"), com:
//   - InMemoryChannel: captura as respostas (getSent) e injeta mensagens
//     inbound (receive), implementando a porta ChannelAdapter (Req 1.6, 2.2).
//   - MockInterpreter roteirizado: mapa `texto → MealInterpretation`, sem rede
//     (Req 3.11), permitindo cenários determinísticos.
//   - clock fixo: mantém a janela de confirmação (10 min) sempre aberta (Req 6.6).
//   - fixture controlado: `seedFoods: false` + `seedArrozFixture` semeiam um
//     único alimento "Arroz branco cozido" (alias "arroz") com UMA medida, para
//     resolução determinística e desacoplada da base de alimentos de produção.
//
// Foco (Req 11.5, 11.6 / 19.5): quando faltam informações, o orquestrador
// pergunta APENAS o que falta e, ao completar os dados em turnos seguintes,
// chega ao MESMO desfecho do fluxo completo (confirmação → cálculo → persistência).
//
// Nota sobre ambiguidade de alimentos: sobre a app composta (SqliteRepository),
// o desfecho AMBIGUOUS é inalcançável de forma determinística — `findFoodCandidates`
// usa correspondência EXATA (nome OU alias), idêntica às etapas anteriores da
// cadeia; assim, se alias/nome exatos não casam, não há candidatos (>=2) a
// desambiguar (a ambiguidade só emerge com um repositório de correspondência por
// substring, exercitado no teste de propriedade `food-ambiguity`). Por isso o
// segundo sub-fluxo é a variante análoga "faltando o tipo de refeição", que
// demonstra igualmente "perguntar só o que falta" e "chegar ao mesmo desfecho".

import { afterEach, describe, expect, it } from "vitest";

import { buildApp, type App } from "../../src/app/wiring.js";
import {
  InMemoryChannel,
} from "../../src/adapters/persistence/in-memory-repository.js";
import { MockInterpreter } from "../../src/adapters/interpreter-mock/mock-interpreter.js";
import type { MealInterpretation } from "../../src/domain/types.js";
import { seedArrozFixture } from "./food-fixture.js";

// Relógio fixo: toda a interação acontece no mesmo instante, mantendo a janela
// de confirmação de 10 minutos sempre aberta (Req 6.6).
const FIXED_NOW = new Date("2025-01-01T12:00:00.000Z");
const fixedClock = (): Date => FIXED_NOW;

// Conta as refeições efetivamente persistidas no SQLite (Req 9). Usa a MESMA
// conexão do repositório via getDatabase() para alcançar o banco ":memory:".
function persistedMealCount(app: App): number {
  const row = app.repo
    .getDatabase()
    .prepare("SELECT COUNT(*) AS n FROM meal")
    .get() as { n: number };
  return row.n;
}

// Última resposta textual enviada ao usuário (Req 1.5).
function lastSent(channel: InMemoryChannel): string {
  const sent = channel.getSent();
  return sent[sent.length - 1] ?? "";
}

describe("E2E: fluxo que requer perguntas (Req 11.5, 19.5)", () => {
  let app: App | null = null;

  afterEach(async () => {
    if (app !== null) {
      await app.stop();
      app = null;
    }
  });

  it("Flow A — glicemia ausente, depois fornecida: pergunta só a glicemia e chega ao mesmo desfecho", async () => {
    const M1 = "vou jantar 3 colheres de arroz";
    const M2 = "160";

    // Roteiro determinístico do interpretador (Req 3.11). O orquestrador mescla
    // a resposta numérica curta de M2 no estado acumulado; refeição/itens já
    // vieram de M1.
    const scripted = new Map<string, MealInterpretation>([
      [
        M1,
        {
          glucose: null,
          meal: "DINNER",
          items: [{ foodName: "arroz", quantity: 3, unit: "colher de sopa" }],
          missingInformation: ["GLUCOSE"],
        },
      ],
    ]);

    const channel = new InMemoryChannel();
    app = buildApp({
      dbPath: ":memory:",
      interpreter: new MockInterpreter(scripted),
      channel,
      clock: fixedClock,
      seedFoods: false, // usa fixture controlado, não a base de produção
    });
    seedArrozFixture(app.repo.getDatabase());
    await app.start();

    // --- Turno 1: M1 (sem glicemia) → pergunta APENAS a glicemia (Req 11.1, 11.5) ---
    await channel.receive(M1);

    const afterM1 = lastSent(channel);
    // Pede a glicemia (a única informação ausente).
    expect(afterM1.toLowerCase()).toContain("glicemia");
    // NÃO apresenta a confirmação ainda (Req 6.1 só após dados completos).
    expect(afterM1).not.toContain("Total de carboidratos");
    // Não perguntou tipo de refeição nem alimento (já presentes/resolvidos).
    expect(afterM1).not.toContain("tipo de refeição");
    // Nada foi persistido antes da confirmação (Req 6.4, 9).
    expect(persistedMealCount(app)).toBe(0);

    // --- Turno 2: M2 (glicemia) → dados completos → apresenta confirmação (Req 6.1) ---
    await channel.receive(M2);

    const afterM2 = lastSent(channel);
    // Agora a interpretação está completa → resumo de confirmação com o total de CHO.
    expect(afterM2).toContain("Total de carboidratos");
    // 3 colheres de "Arroz branco cozido": 3 porções de 6.2 g = 18.6 g.
    expect(afterM2).toContain("18.6");
    // Ainda sem persistir: aguarda a confirmação explícita da paciente.
    expect(persistedMealCount(app)).toBe(0);

    // --- Turno 3: "sim" → calcula + persiste (Req 6.3, 19.4) ---
    await channel.receive("sim");

    const afterYes = lastSent(channel);
    expect(afterYes).toContain("Refeição registrada");
    // Dose calculada reportada (mesmo desfecho do fluxo completo — Req 19.5).
    expect(afterYes).toContain("Dose calculada");
    // Exatamente UMA refeição persistida (Req 9).
    expect(persistedMealCount(app)).toBe(1);

    // O cálculo foi persistido com Formula_Version "1.0" (Req 9.6).
    const calc = app.repo
      .getDatabase()
      .prepare("SELECT formula_version, glucose FROM insulin_calculation LIMIT 1")
      .get() as { formula_version: string; glucose: number };
    expect(calc.formula_version).toBe("1.0");
    expect(calc.glucose).toBe(160);
  });

  it("Flow B — tipo de refeição ausente, depois fornecido: pergunta só a refeição e chega ao mesmo desfecho", async () => {
    const M1 = "minha glicemia é 165, 3 colheres de arroz";
    const M2 = "foi no jantar";

    // Variante análoga ao Flow A: falta apenas o tipo de refeição (MEAL).
    const scripted = new Map<string, MealInterpretation>([
      [
        M1,
        {
          glucose: 165,
          meal: null,
          items: [{ foodName: "arroz", quantity: 3, unit: "colher de sopa" }],
          missingInformation: ["MEAL"],
        },
      ],
      [
        M2,
        {
          glucose: null,
          meal: "DINNER",
          items: [],
          missingInformation: ["GLUCOSE", "FOOD", "FOOD_QUANTITY"],
        },
      ],
    ]);

    const channel = new InMemoryChannel();
    app = buildApp({
      dbPath: ":memory:",
      interpreter: new MockInterpreter(scripted),
      channel,
      clock: fixedClock,
      seedFoods: false, // usa fixture controlado, não a base de produção
    });
    seedArrozFixture(app.repo.getDatabase());
    await app.start();

    // --- Turno 1: M1 (sem tipo de refeição) → pergunta APENAS a refeição (Req 11.2, 11.5) ---
    await channel.receive(M1);

    const afterM1 = lastSent(channel);
    // Pede o tipo de refeição (a única informação ausente).
    expect(afterM1).toContain("tipo de refeição");
    // NÃO pergunta a glicemia (já fornecida) — o prompt de glicemia conteria "glicemia".
    expect(afterM1.toLowerCase()).not.toContain("glicemia");
    // NÃO apresenta a confirmação ainda.
    expect(afterM1).not.toContain("Total de carboidratos");
    // Nada persistido antes da confirmação.
    expect(persistedMealCount(app)).toBe(0);

    // --- Turno 2: M2 (tipo de refeição) → dados completos → confirmação (Req 6.1) ---
    await channel.receive(M2);

    const afterM2 = lastSent(channel);
    expect(afterM2).toContain("Total de carboidratos");
    expect(afterM2).toContain("18.6");
    expect(persistedMealCount(app)).toBe(0);

    // --- Turno 3: "sim" → calcula + persiste (Req 6.3, 19.4, 19.5) ---
    await channel.receive("sim");

    const afterYes = lastSent(channel);
    expect(afterYes).toContain("Refeição registrada");
    expect(afterYes).toContain("Dose calculada");
    expect(persistedMealCount(app)).toBe(1);

    // Persistido como jantar (DINNER), refletindo o dado fornecido no 2º turno.
    const meal = app.repo
      .getDatabase()
      .prepare("SELECT meal_type, glucose FROM meal LIMIT 1")
      .get() as { meal_type: string; glucose: number };
    expect(meal.meal_type).toBe("DINNER");
    expect(meal.glucose).toBe(165);
  });
});
