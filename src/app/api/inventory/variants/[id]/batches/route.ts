import { z } from "zod";
import { idParam, parseQuery, tenantRoute } from "@/lib/api/handler";
import { listVariantBatches } from "@/controller/catalog/items";

const query = z.object({ saleId: z.string().uuid().optional() });

// Batches to sell from, for the Sales screen's batch picker.
export const GET = tenantRoute({ permission: ["inventory.view", "sales.manage"] }, async ({ req, params, auth }) =>
  listVariantBatches(auth, idParam(params), parseQuery(req, query).saleId),
);
