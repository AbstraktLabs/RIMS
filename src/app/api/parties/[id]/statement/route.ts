import { z } from "zod";
import { idParam, parseQuery, tenantRoute } from "@/lib/api/handler";
import { isoDate } from "@/lib/validation/common";
import { partyStatement } from "@/controller/parties/controller";

const query = z.object({ startDate: isoDate.optional(), endDate: isoDate.optional() });

// Account statement for the Party Ledger screen.
export const GET = tenantRoute({ permission: "parties.view" }, async ({ req, params, auth }) =>
  partyStatement(auth, idParam(params), parseQuery(req, query)),
);
