import type { Sql } from "../db/client.js";
import type { EvolutionClient } from "./evolution.js";

export type WhatsappSetup = { evolution: EvolutionClient; webhookBaseUrl: string; webhookSecret: string };

export const instanceNameFor = (slug: string) => `chamalia-${slug}`;

/**
 * Makes sure the tenant has an Evolution instance pointing to our webhook and
 * returns its state, plus a QR code while it is not connected.
 */
export async function connectTenantWhatsapp(sql: Sql, setup: WhatsappSetup, tenant: { id: string; slug: string }) {
  const instance = instanceNameFor(tenant.slug);
  const webhookUrl = `${setup.webhookBaseUrl.replace(/\/$/, "")}/webhooks/evolution?secret=${setup.webhookSecret}`;
  if (await setup.evolution.instanceExists(instance)) {
    await setup.evolution.setWebhook(instance, webhookUrl);
  } else {
    await setup.evolution.createInstance(instance, webhookUrl);
  }
  await sql`update tenants set whatsapp_instance = ${instance}, whatsapp_provider = 'evolution' where id = ${tenant.id}`;

  const state = await setup.evolution.connectionState(instance);
  const qrCode = state === "open" ? undefined : await setup.evolution.qrCode(instance);
  return { instance, state, qrCode };
}
