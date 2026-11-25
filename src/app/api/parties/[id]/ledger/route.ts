import { idParam, parseQuery, tenantRoute } from "@/lib/api/handler";
import { ledgerQuery } from "@/lib/validation/parties";
import { partyLedger } from "@/controller/parties/controller";

export const GET = tenantRoute({ permission: ["parties.view", "finance.view"] }, async ({ req, params, auth }) =>
  partyLedger(auth, idParam(params), parseQuery(req, ledgerQuery)),
);
