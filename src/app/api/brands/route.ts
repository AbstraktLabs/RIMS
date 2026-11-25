import { z } from "zod";
import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { booleanString } from "@/lib/validation/common";
import { brandSchema } from "@/lib/validation/catalog";
import { createBrand, listBrands } from "@/controller/catalog/categories";

const query = z.object({ includeInactive: booleanString.optional() });

export const GET = tenantRoute({}, async ({ req, auth }) => listBrands(auth, !!parseQuery(req, query).includeInactive));

export const POST = tenantRoute({ permission: "products.manage" }, async ({ req, auth }) =>
  created(await createBrand(auth, await parseBody(req, brandSchema))),
);
