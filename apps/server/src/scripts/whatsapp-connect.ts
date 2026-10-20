// Connects a tenant's WhatsApp number through Evolution:
//   npm run whatsapp:connect -- <tenant-slug>
// Creates the instance (with our webhook), links it to the tenant and opens a
// page with the QR code until the phone is connected.
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvolutionClient } from "../channels/evolution.js";
import { loadConfig } from "../config.js";
import { createDb } from "../db/client.js";

const POLL_SECONDS = 5;
const TIMEOUT_MINUTES = 5;

const config = loadConfig();
const slug = process.argv[2] ?? "demo";
for (const name of ["DATABASE_URL", "EVOLUTION_API_URL", "EVOLUTION_API_KEY", "WEBHOOK_SECRET"] as const) {
  if (!config[name]) {
    console.error(`${name} não está definida no .env`);
    process.exit(1);
  }
}

const sql = createDb(config.DATABASE_URL!);
const evolution = new EvolutionClient(config.EVOLUTION_API_URL!, config.EVOLUTION_API_KEY!);
const qrPage = join(tmpdir(), "chamalia-whatsapp-qr.html");

function renderPage(title: string, qr?: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="refresh" content="${POLL_SECONDS}">
<title>Conectar WhatsApp</title><style>body{font-family:system-ui,sans-serif;text-align:center;margin-top:40px;color:#1f2328}</style></head>
<body><h2>${title}</h2>${qr ? `<img src="${qr}" width="300" height="300" alt="QR code"><p>No celular do chip: WhatsApp &gt; Configurações &gt; Aparelhos conectados &gt; Conectar aparelho.</p>` : ""}
<p style="color:#656d76">Esta página atualiza sozinha.</p></body></html>`;
}

try {
  const [tenant] = await sql<{ id: string; name: string }[]>`select id, name from tenants where slug = ${slug}`;
  if (!tenant) throw new Error(`Cliente "${slug}" não encontrado.`);

  const instance = `chamalia-${slug}`;
  const webhookUrl = `${config.EVOLUTION_WEBHOOK_BASE_URL.replace(/\/$/, "")}/webhooks/evolution?secret=${config.WEBHOOK_SECRET}`;
  if (await evolution.instanceExists(instance)) {
    await evolution.setWebhook(instance, webhookUrl);
  } else {
    await evolution.createInstance(instance, webhookUrl);
  }
  await sql`update tenants set whatsapp_instance = ${instance}, whatsapp_provider = 'evolution' where id = ${tenant.id}`;
  console.log(`Instância "${instance}" ligada a ${tenant.name}.`);

  let opened = false;
  const deadline = Date.now() + TIMEOUT_MINUTES * 60_000;
  while (Date.now() < deadline) {
    const state = await evolution.connectionState(instance);
    if (state === "open") {
      await writeFile(qrPage, renderPage(`${tenant.name}: WhatsApp conectado ✔`));
      console.log("WhatsApp conectado! Pode fechar a página do QR code.");
      break;
    }
    const qr = await evolution.qrCode(instance);
    await writeFile(qrPage, renderPage(`Escaneie para conectar: ${tenant.name}`, qr));
    if (!opened) {
      // Windows: open the page in the default browser.
      spawn("cmd", ["/c", "start", "", qrPage], { detached: true, stdio: "ignore" }).unref();
      console.log(`QR code aberto no navegador (${qrPage}). Aguardando a leitura...`);
      opened = true;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_SECONDS * 1000));
  }
  if (Date.now() >= deadline) console.log("Tempo esgotado. Rode o comando de novo para gerar outro QR code.");
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
