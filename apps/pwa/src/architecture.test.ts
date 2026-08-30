import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sourceRoot = new URL(".", import.meta.url).pathname;

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

function importedPaths(file: string): readonly string[] {
  const source = readFileSync(file, "utf8");
  return Array.from(source.matchAll(/from\s+["']([^"']+)["']/g), (match) => match[1] ?? "");
}

describe("arquitetura da PWA", () => {
  it("mantém o domínio independente de aplicação, adaptadores e React", () => {
    const domainFiles = sourceFiles(join(sourceRoot, "domain"));
    for (const file of domainFiles) {
      for (const importedPath of importedPaths(file)) {
        expect(importedPath, file).not.toMatch(/(?:application|adapters|react|node:|vite)/);
      }
    }
  });

  it("mantém a aplicação dependente apenas do domínio", () => {
    const applicationFiles = sourceFiles(join(sourceRoot, "application"));
    for (const file of applicationFiles) {
      for (const importedPath of importedPaths(file)) {
        expect(importedPath, file).not.toMatch(/(?:adapters|react|node:|vite)/);
      }
    }
  });
});
