import { loadSuite, runLive } from "./eval.mjs";

const { cases, foods, table } = await loadSuite();
const selected = process.argv.includes("--case") ? cases.filter((item) => item.id === process.argv[process.argv.indexOf("--case") + 1]) : cases;
if (selected.length === 0) throw new Error("Caso não encontrado.");
const delayIndex = process.argv.indexOf("--delay-ms");
const delayMs = delayIndex < 0 ? 0 : Number(process.argv[delayIndex + 1]);
if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 120_000) throw new Error("--delay-ms deve estar entre 0 e 120000.");
try {
  const results = await runLive({
    apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL, cases: selected, foods, table, delayMs,
    onResult: (result) => console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id}${result.failures.length ? `: ${result.failures.join(" ")}` : ""}`)
  });
  console.log(`${results.filter((result) => result.passed).length}/${results.length} casos aprovados.`);
  if (results.some((result) => !result.passed)) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha ao executar evals.");
  process.exitCode = 1;
}
