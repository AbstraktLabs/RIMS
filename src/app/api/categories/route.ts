import { z } from "zod";
import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { booleanString } from "@/lib/validation/common";
import { categorySchema } from "@/lib/validation/catalog";
import { createCategory, listCategories } from "@/controller/catalog/categories";

const query = z.object({ includeInactive: booleanString.optional() });

export const GET = tenantRoute({}, async ({ req, auth }) =>
  listCategories(auth, !!parseQuery(req, query).includeInactive),
);

export const POST = tenantRoute({ permission: "products.manage" }, async ({ req, auth }) =>
  created(await createCategory(auth, await parseBody(req, categorySchema))),
);
