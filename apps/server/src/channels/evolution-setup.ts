import type { Sql } from "../db/client.js";
import type { EvolutionClient } from "./evolution.js";

export type WhatsappSetup = { evolution: EvolutionClient; webhookBaseUrl: string; webhookSecret: string };

/** Stores the connected number on the tenant (shown in the panel) and returns it. */
export async function syncConnectedNumber(sql: Sql, setup: WhatsappSetup, tenantId: string, instance: string) {
  const number = await setup.evolution.connectedNumber(instance).catch(() => undefined);
  await sql`update tenants set whatsapp_number = ${number ?? null} where id = ${tenantId}`;
  return number;
}

export const instanceNameFor = (slug: string) => `chamalia-${slug}`;

/**
 * Makes sure the tenant has an Evolution instance pointing to our webhook and
 * returns its state, plus a QR code while it is not connected.
 */
export async function connectTenantWhatsapp(
  sql: Sql,
  setup: WhatsappSetup,
  tenant: { id: string; slug: string },
  options: { pairingPhone?: string } = {},
) {
  const instance = instanceNameFor(tenant.slug);
  const webhookUrl = `${setup.webhookBaseUrl.replace(/\/$/, "")}/webhooks/evolution?secret=${setup.webhookSecret}`;
  if (await setup.evolution.instanceExists(instance)) {
    await setup.evolution.setWebhook(instance, webhookUrl);
  } else {
    await setup.evolution.createInstance(instance, webhookUrl);
  }
  await sql`update tenants set whatsapp_instance = ${instance}, whatsapp_provider = 'evolution' where id = ${tenant.id}`;

  const state = await setup.evolution.connectionState(instance);
  if (state === "open") return { instance, state, number: await syncConnectedNumber(sql, setup, tenant.id, instance) };
  if (options.pairingPhone) {
    const pairingCode = await setup.evolution.pairingCode(instance, options.pairingPhone).catch(() => undefined);
    // No code (number not accepted by WhatsApp): fall back to the QR code.
    if (pairingCode) return { instance, state, pairingCode };
  }
  return { instance, state, qrCode: await setup.evolution.qrCode(instance) };
}
