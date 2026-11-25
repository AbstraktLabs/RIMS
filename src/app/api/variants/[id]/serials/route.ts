import { z } from "zod";
import { idParam, parseQuery, tenantRoute } from "@/lib/api/handler";
import { uuid } from "@/lib/validation/common";
import { availableSerials } from "@/controller/catalog/products";

const query = z.object({ locationId: uuid.optional() });

export const GET = tenantRoute(
  { permission: ["inventory.view", "sales.manage", "purchases.manage", "inventory.manage"] },
  async ({ req, params, auth }) => availableSerials(auth, idParam(params), parseQuery(req, query).locationId),
);
