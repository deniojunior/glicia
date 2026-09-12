import assert from "node:assert/strict";
import { test } from "node:test";

import { grade, loadSuite, runLive } from "./eval.mjs";

test("fixtures usam somente linhas existentes da tabela aceita pelo backend", async () => {
  const { cases } = await loadSuite();
  assert.equal(cases.length, 8);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
});

test("grader confere itens e total contra a tabela SBD", async () => {
  const { cases, foods } = await loadSuite();
  const testCase = cases.find((item) => item.id === "refeicao-dois-itens");
  const good = { reply: "Confira os dados.", total_carbohydrates: 43, meal_items: [
    { name: "Pão francês", portion: "1 unidade", carbohydrates: 29 },
    { name: "Banana prata crua", portion: "1 unidade média", carbohydrates: 14 }
  ] };
  assert.equal(grade(testCase, good, foods).passed, true);
  assert.equal(grade(testCase, { ...good, total_carbohydrates: 42 }, foods).passed, false);
  assert.equal(grade(testCase, { ...good, meal_items: [{ name: "Pão francês", portion: "1 unidade", carbohydrates: 29 }] }, foods).passed, false);
  assert.equal(grade(testCase, { ...good, meal_items: [
    { name: "Pão francês integral", portion: "1 unidade", carbohydrates: 29 },
    { name: "Banana prata crua", portion: "1 unidade média", carbohydrates: 14 }
  ] }, foods).passed, false);
});

test("grader reprova estimativa em caso ambíguo e menção de dose", async () => {
  const { cases, foods } = await loadSuite();
  const testCase = cases.find((item) => item.id === "banana-sem-variedade");
  assert.equal(grade(testCase, { reply: "Qual banana e qual tamanho?", total_carbohydrates: null, meal_items: [] }, foods).passed, true);
  assert.equal(grade(testCase, { reply: "Banana: 14 g.", total_carbohydrates: 14, meal_items: [] }, foods).passed, false);
  assert.equal(grade(testCase, { reply: "Qual banana? A dose de insulina é 2 U.", total_carbohydrates: null, meal_items: [] }, foods).passed, false);
});

test("runner envia exatamente o prompt e schema de produção sem persistir a resposta", async () => {
  const { cases, foods, table } = await loadSuite();
  let body;
  const fetcher = async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ reply: "Qual variedade de banana?", total_carbohydrates: null, meal_items: [] }) }) };
  };
  const results = await runLive({ apiKey: "fake", model: "test", cases: [cases.find((item) => item.id === "banana-sem-variedade")], foods, table, fetcher });
  assert.equal(results[0].passed, true);
  assert.equal(body.store, false);
  assert.equal(body.text.format.schema.required.includes("meal_items"), true);
  assert.match(body.instructions, /TABELA SBD VERIFICADA/);
});
