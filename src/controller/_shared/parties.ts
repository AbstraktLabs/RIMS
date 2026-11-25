import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { parties } from "@/db/schema";
import { badRequest, notFound } from "@/lib/errors";

/** Loads a party of this tenant and checks it can act as a supplier / customer. */
export async function loadParty(tx: DbOrTx, organizationId: string, partyId: string, role: "SUPPLIER" | "CUSTOMER") {
  const party = await tx.query.parties.findFirst({
    where: and(eq(parties.id, partyId), eq(parties.organizationId, organizationId)),
  });
  if (!party) throw notFound(role === "SUPPLIER" ? "Supplier" : "Customer");
  if (!party.isActive) throw badRequest(`${party.name} is inactive`);
  if (party.partyType !== role && party.partyType !== "BOTH") {
    throw badRequest(`${party.name} is not set up as a ${role.toLowerCase()}`);
  }
  return party;
}
