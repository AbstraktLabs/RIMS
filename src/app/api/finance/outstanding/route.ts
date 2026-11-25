import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { outstandingQuery } from "@/lib/validation/finance";
import { outstanding } from "@/controller/finance/entries";

export const GET = tenantRoute({ permission: "finance.view" }, async ({ req, auth }) =>
  outstanding(auth, parseQuery(req, outstandingQuery)),
);
