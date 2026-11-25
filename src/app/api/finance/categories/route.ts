import { z } from "zod";
import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { financeCategorySchema } from "@/lib/validation/finance";
import { createFinanceCategory, listFinanceCategories } from "@/controller/finance/entries";

const query = z.object({ kind: z.enum(["INCOME", "EXPENSE"]).optional() });

export const GET = tenantRoute({ permission: "finance.view" }, async ({ req, auth }) =>
  listFinanceCategories(auth, parseQuery(req, query).kind),
);

export const POST = tenantRoute({ permission: "finance.manage" }, async ({ req, auth }) =>
  created(await createFinanceCategory(auth, await parseBody(req, financeCategorySchema))),
);
