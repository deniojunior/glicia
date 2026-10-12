import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [, , sourcePath, destinationPath, projectRef, publicAppUrl] = process.argv;
if (!sourcePath || !destinationPath || !projectRef || !publicAppUrl) {
  throw new Error("Uso: render-supabase-config <origem> <destino> <project-ref> <public-app-url>");
}

const origin = new URL(publicAppUrl).origin;
let config = await readFile(sourcePath, "utf8");
config = config
  .replace(/^project_id = .*$/m, `project_id = ${JSON.stringify(projectRef)}`)
  .replace(/^site_url = .*$/m, `site_url = ${JSON.stringify(`${origin}/`)}`)
  .replace(/^additional_redirect_urls = .*$/m, `additional_redirect_urls = [${JSON.stringify(`${origin}/**`)}]`);

if (/^\[vector\]$/m.test(config)) {
  config = config.replace(/(^\[vector\]\s*\n)enabled = .*$/m, "$1enabled = false");
} else {
  config += "\n[vector]\nenabled = false\n";
}

await mkdir(dirname(destinationPath), { recursive: true });
await writeFile(destinationPath, config);
