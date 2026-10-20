import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Sql } from "../db/client.js";
import { PRICE_FILE_MAX_BYTES, PRICE_FILE_MIMES } from "../conversation/price-table.js";

const params = z.object({ tenantId: z.string().uuid() });
// The file travels as base64 inside the JSON body (about a third bigger).
const BODY_LIMIT = Math.ceil(PRICE_FILE_MAX_BYTES * 1.4) + 64 * 1024;

const putBody = z.object({
  body: z
    .string()
    .trim()
    .max(4000)
    .nullable()
    .transform((value) => value || null),
  /** Omitted: keep the current file. null: remove it. */
  file: z
    .object({
      name: z.string().trim().min(1).max(120),
      mime: z.enum(PRICE_FILE_MIMES),
      dataBase64: z.string().min(1),
    })
    .nullable()
    .optional(),
});

/** The price list the assistant sends on request: text and/or one image or PDF. */
export function registerPriceTableRoutes(app: FastifyInstance, sql: Sql) {
  app.get("/api/tenants/:tenantId/price-table", async (request) => {
    const { tenantId } = params.parse(request.params);
    const [row] = await sql<{ body: string | null; fileName: string | null; fileMime: string | null; fileData: Buffer | null; updatedAt: Date }[]>`
      select body, file_name, file_mime, file_data, updated_at from price_tables where tenant_id = ${tenantId}
    `;
    if (!row) return { body: null, file: null };
    return {
      body: row.body,
      updatedAt: row.updatedAt,
      file: row.fileData
        ? {
            name: row.fileName,
            mime: row.fileMime,
            size: row.fileData.length,
            // Images are previewed in the panel; PDFs only show the name.
            dataUrl: row.fileMime?.startsWith("image/") ? `data:${row.fileMime};base64,${row.fileData.toString("base64")}` : null,
          }
        : null,
    };
  });

  app.put("/api/tenants/:tenantId/price-table", { bodyLimit: BODY_LIMIT }, async (request, reply) => {
    const { tenantId } = params.parse(request.params);
    const body = putBody.parse(request.body);

    let data: Buffer | null | undefined;
    if (body.file) {
      data = Buffer.from(body.file.dataBase64, "base64");
      if (data.length === 0) return reply.code(400).send({ error: "invalid_file", message: "Arquivo vazio." });
      if (data.length > PRICE_FILE_MAX_BYTES) {
        return reply.code(413).send({ error: "file_too_large", message: "O arquivo passa de 5 MB. Envie uma imagem menor." });
      }
    } else if (body.file === null) {
      data = null;
    }

    const file =
      data === undefined
        ? sql``
        : data === null
          ? sql`, file_name = null, file_mime = null, file_data = null`
          : sql`, file_name = ${body.file!.name}, file_mime = ${body.file!.mime}, file_data = ${data}`;
    await sql`
      insert into price_tables (tenant_id, body, file_name, file_mime, file_data)
      values (${tenantId}, ${body.body}, ${data && body.file ? body.file.name : null}, ${data && body.file ? body.file.mime : null}, ${data ?? null})
      on conflict (tenant_id) do update set body = ${body.body}, updated_at = now() ${file}
    `;
    return { saved: true };
  });
}
