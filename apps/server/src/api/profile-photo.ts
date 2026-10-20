import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { WhatsappSetup } from "../channels/evolution-setup.js";
import type { Sql } from "../db/client.js";

const params = z.object({ tenantId: z.string().uuid() });
const MAX_BYTES = 1024 * 1024;
const putBody = z.object({ mime: z.enum(["image/jpeg", "image/png", "image/webp"]), dataBase64: z.string().min(1) });

/**
 * The assistant's photo: kept in the database (the panel shows it) and pushed
 * to the WhatsApp profile when a number is connected.
 */
export function registerProfilePhotoRoutes(app: FastifyInstance, sql: Sql, whatsapp?: WhatsappSetup) {
  app.get("/api/tenants/:tenantId/assistant-photo", async (request) => {
    const { tenantId } = params.parse(request.params);
    const [row] = await sql<{ assistantPhoto: Buffer | null; assistantPhotoMime: string | null }[]>`
      select assistant_photo, assistant_photo_mime from tenants where id = ${tenantId}
    `;
    return {
      dataUrl: row?.assistantPhoto ? `data:${row.assistantPhotoMime};base64,${row.assistantPhoto.toString("base64")}` : null,
    };
  });

  app.put("/api/tenants/:tenantId/assistant-photo", { bodyLimit: Math.ceil(MAX_BYTES * 1.4) + 16 * 1024 }, async (request, reply) => {
    const { tenantId } = params.parse(request.params);
    const body = putBody.parse(request.body);
    const data = Buffer.from(body.dataBase64, "base64");
    if (data.length === 0 || data.length > MAX_BYTES) {
      return reply.code(413).send({ error: "file_too_large", message: "A foto precisa ter até 1 MB." });
    }
    const [tenant] = await sql<{ whatsappInstance: string | null }[]>`
      update tenants set assistant_photo = ${data}, assistant_photo_mime = ${body.mime}
      where id = ${tenantId} returning whatsapp_instance
    `;
    if (!tenant) return reply.code(404).send({ error: "not_found" });

    // Also on WhatsApp, when a number is connected; the photo stays saved either way.
    let whatsappUpdated = false;
    if (whatsapp && tenant.whatsappInstance) {
      try {
        if ((await whatsapp.evolution.connectionState(tenant.whatsappInstance)) === "open") {
          await whatsapp.evolution.updateProfilePicture(tenant.whatsappInstance, body.dataBase64);
          whatsappUpdated = true;
        }
      } catch (error) {
        request.log.warn({ err: error, tenantId }, "could not update WhatsApp profile picture");
      }
    }
    return { saved: true, whatsappUpdated };
  });

  app.delete("/api/tenants/:tenantId/assistant-photo", async (request) => {
    const { tenantId } = params.parse(request.params);
    await sql`update tenants set assistant_photo = null, assistant_photo_mime = null where id = ${tenantId}`;
    return { deleted: true };
  });
}
