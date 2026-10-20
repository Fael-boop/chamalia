import type { Sql } from "../db/client.js";
import type { OutgoingFile } from "../channels/channel.js";

export const PRICE_FILE_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
/** WhatsApp accepts much more, but this keeps the database and the request small. */
export const PRICE_FILE_MAX_BYTES = 5 * 1024 * 1024;

export type PriceTable = { body: string | null; file: OutgoingFile | null };

/** What the assistant can send: the written table and/or the file. */
export async function loadPriceTable(sql: Sql, tenantId: string): Promise<PriceTable | undefined> {
  const [row] = await sql<{ body: string | null; fileName: string | null; fileMime: string | null; fileData: Buffer | null }[]>`
    select body, file_name, file_mime, file_data from price_tables where tenant_id = ${tenantId}
  `;
  if (!row || (!row.body && !row.fileData)) return undefined;
  return {
    body: row.body,
    file: row.fileData && row.fileMime ? { name: row.fileName ?? "tabela-de-precos", mime: row.fileMime, data: row.fileData } : null,
  };
}
