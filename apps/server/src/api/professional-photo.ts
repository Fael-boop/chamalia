import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Sql } from "../db/client.js";

const tenantParams = z.object({ tenantId: z.string().uuid() });
const itemParams = tenantParams.extend({ id: z.string().uuid() });
const MAX_BYTES = 256 * 1024;
const putBody = z.object({ mime: z.enum(["image/jpeg", "image/png", "image/webp"]), dataBase64: z.string().min(1) });

/** Team photos for the agenda and the Profissionais screen. They stay in the panel (not the WhatsApp photo). */
export function registerProfessionalPhotoRoutes(app: FastifyInstance, sql: Sql) {
  // All photos of the business in one call: { [professionalId]: dataUrl }. They are small squares.
  app.get("/api/tenants/:tenantId/professional-photos", async (request) => {
    const { tenantId } = tenantParams.parse(request.params);
    const rows = await sql<{ id: string; photo: Buffer; photoMime: string }[]>`
      select id, photo, photo_mime from professionals where tenant_id = ${tenantId} and photo is not null
    `;
    return Object.fromEntries(rows.map((row) => [row.id, `data:${row.photoMime};base64,${row.photo.toString("base64")}`]));
  });

  app.put("/api/tenants/:tenantId/professionals/:id/photo", { bodyLimit: Math.ceil(MAX_BYTES * 1.4) + 16 * 1024 }, async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const body = putBody.parse(request.body);
    const data = Buffer.from(body.dataBase64, "base64");
    if (data.length === 0 || data.length > MAX_BYTES) {
      return reply.code(413).send({ error: "file_too_large", message: "A foto precisa ter até 256 KB." });
    }
    const rows = await sql`update professionals set photo = ${data}, photo_mime = ${body.mime} where tenant_id = ${tenantId} and id = ${id} returning id`;
    return rows.length ? { saved: true } : reply.code(404).send({ error: "not_found" });
  });

  app.delete("/api/tenants/:tenantId/professionals/:id/photo", async (request, reply) => {
    const { tenantId, id } = itemParams.parse(request.params);
    const rows = await sql`update professionals set photo = null, photo_mime = null where tenant_id = ${tenantId} and id = ${id} returning id`;
    return rows.length ? { deleted: true } : reply.code(404).send({ error: "not_found" });
  });
}
