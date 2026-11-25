import { z } from "zod";
import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { booleanString } from "@/lib/validation/common";
import { unitSchema } from "@/lib/validation/settings";
import { createUnit, listUnits } from "@/controller/settings/controller";

const query = z.object({ includeInactive: booleanString.optional() });

export const GET = tenantRoute({}, async ({ req, auth }) =>
  listUnits(auth, !!parseQuery(req, query).includeInactive),
);

export const POST = tenantRoute({ permission: "products.manage" }, async ({ req, auth }) =>
  created(await createUnit(auth, await parseBody(req, unitSchema))),
);
