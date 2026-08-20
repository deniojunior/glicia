import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Fase 1: todos os testes rodam offline, sem chamadas de rede (Req 18.6).
    environment: "node",
    globals: false,
    include: [
      "tests/**/*.{test,spec}.ts",
      "src/**/*.{test,spec}.ts",
    ],
    // Testes de propriedade (fast-check) podem ser mais lentos.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
