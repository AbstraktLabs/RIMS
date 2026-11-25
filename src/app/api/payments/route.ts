import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { partyPaymentSchema, paymentsQuery } from "@/lib/validation/finance";
import { listPayments, recordPartyPayment } from "@/controller/finance/payments";

export const GET = tenantRoute({ permission: "finance.view" }, async ({ req, auth }) =>
  listPayments(auth, parseQuery(req, paymentsQuery)),
);

export const POST = tenantRoute({ permission: "finance.manage" }, async ({ req, auth }) =>
  created(await recordPartyPayment(auth, await parseBody(req, partyPaymentSchema))),
);
