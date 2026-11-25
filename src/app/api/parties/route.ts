import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { partiesQuery, partySchema } from "@/lib/validation/parties";
import { createParty, listParties } from "@/controller/parties/controller";

// POS and purchasing need to pick customers/suppliers, so they can read the list too.
export const GET = tenantRoute(
  { permission: ["parties.view", "sales.manage", "purchases.manage"] },
  async ({ req, auth }) => listParties(auth, parseQuery(req, partiesQuery)),
);

// cashiers can add a customer at the till
export const POST = tenantRoute({ permission: ["parties.manage", "sales.manage"] }, async ({ req, auth }) =>
  created(await createParty(auth, await parseBody(req, partySchema))),
);
