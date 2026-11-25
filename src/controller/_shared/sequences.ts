import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { documentSequences } from "@/db/schema";
import { DEFAULT_DOCUMENT_PREFIXES } from "@/db/tenant-defaults";

export type DocumentType = keyof typeof DEFAULT_DOCUMENT_PREFIXES;

/**
 * Next gap-free document number for a tenant, e.g. "INV-00042".
 * Must be called inside the transaction that creates the document: the UPDATE
 * locks the sequence row until commit, so concurrent sales never share a number
 * and a rolled-back sale does not burn one.
 */
export async function nextDocumentNumber(tx: DbOrTx, organizationId: string, type: DocumentType): Promise<string> {
  const [row] = await tx
    .update(documentSequences)
    .set({ nextNumber: sql`${documentSequences.nextNumber} + 1` })
    .where(and(eq(documentSequences.organizationId, organizationId), eq(documentSequences.documentType, type)))
    .returning({
      prefix: documentSequences.prefix,
      issued: sql<number>`${documentSequences.nextNumber} - 1`,
      padding: documentSequences.padding,
    });

  if (row) return `${row.prefix}${String(row.issued).padStart(row.padding, "0")}`;

  // sequence row missing (older tenant) — create it and retry once
  await tx
    .insert(documentSequences)
    .values({ organizationId, documentType: type, prefix: DEFAULT_DOCUMENT_PREFIXES[type] })
    .onConflictDoNothing();
  return nextDocumentNumber(tx, organizationId, type);
}
