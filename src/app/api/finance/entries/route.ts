import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { financeEntriesQuery, financeEntrySchema } from "@/lib/validation/finance";
import { createFinanceEntry, listFinanceEntries } from "@/controller/finance/entries";

export const GET = tenantRoute({ permission: "finance.view" }, async ({ req, auth }) =>
  listFinanceEntries(auth, parseQuery(req, financeEntriesQuery)),
);

export const POST = tenantRoute({ permission: "finance.manage" }, async ({ req, auth }) =>
  created(await createFinanceEntry(auth, await parseBody(req, financeEntrySchema))),
);
