const [publicAppUrl] = process.argv.slice(2);

if (!publicAppUrl) throw new Error("Uso: smoke-pwa <public-app-url>");

const origin = new URL(publicAppUrl).origin;
const page = await fetch(`${origin}/`, { redirect: "follow" });
if (!page.ok) throw new Error(`A página inicial respondeu HTTP ${page.status}.`);

const html = await page.text();
if (!html.includes('<html lang="pt-BR">') || !html.includes("<title>Glicia</title>")) {
  throw new Error("A página publicada não parece ser a PWA da Glicia.");
}

const manifest = await fetch(`${origin}/manifest.webmanifest`, { redirect: "follow" });
if (!manifest.ok) throw new Error(`O manifesto respondeu HTTP ${manifest.status}.`);
const manifestBody = await manifest.json();
if (manifestBody.name !== "Glicia" || manifestBody.display !== "standalone") {
  throw new Error("O manifesto publicado não está configurado para instalação standalone.");
}

const serviceWorker = await fetch(`${origin}/sw.js`, { redirect: "follow" });
if (!serviceWorker.ok) throw new Error(`O service worker respondeu HTTP ${serviceWorker.status}.`);

console.log(`Smoke test aprovado em ${origin}.`);
