import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Sql } from "../db/client.js";

const params = z.object({ tenantId: z.string().uuid() });
const MAX_BYTES = 512 * 1024;
const putBody = z.object({ mime: z.enum(["image/jpeg", "image/png", "image/webp"]), dataBase64: z.string().min(1) });

/**
 * The business's logo, shown in the panel's menu and profile. It is not the WhatsApp photo
 * (that one is the assistant's, in profile-photo.ts) and never leaves the panel.
 */
export function registerBusinessLogoRoutes(app: FastifyInstance, sql: Sql) {
  app.get("/api/tenants/:tenantId/logo", async (request) => {
    const { tenantId } = params.parse(request.params);
    const [row] = await sql<{ logo: Buffer | null; logoMime: string | null }[]>`
      select logo, logo_mime from tenants where id = ${tenantId}
    `;
    return { dataUrl: row?.logo ? `data:${row.logoMime};base64,${row.logo.toString("base64")}` : null };
  });

  app.put("/api/tenants/:tenantId/logo", { bodyLimit: Math.ceil(MAX_BYTES * 1.4) + 16 * 1024 }, async (request, reply) => {
    const { tenantId } = params.parse(request.params);
    const body = putBody.parse(request.body);
    const data = Buffer.from(body.dataBase64, "base64");
    if (data.length === 0 || data.length > MAX_BYTES) {
      return reply.code(413).send({ error: "file_too_large", message: "A logo precisa ter até 512 KB." });
    }
    const [tenant] = await sql`update tenants set logo = ${data}, logo_mime = ${body.mime} where id = ${tenantId} returning id`;
    return tenant ? { saved: true } : reply.code(404).send({ error: "not_found" });
  });

  app.delete("/api/tenants/:tenantId/logo", async (request) => {
    const { tenantId } = params.parse(request.params);
    await sql`update tenants set logo = null, logo_mime = null where id = ${tenantId}`;
    return { deleted: true };
  });
}
