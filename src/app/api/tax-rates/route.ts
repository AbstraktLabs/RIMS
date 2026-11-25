import { z } from "zod";
import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { booleanString } from "@/lib/validation/common";
import { taxRateSchema } from "@/lib/validation/settings";
import { createTaxRate, listTaxRates } from "@/controller/settings/controller";

const query = z.object({ includeInactive: booleanString.optional() });

export const GET = tenantRoute({}, async ({ req, auth }) =>
  listTaxRates(auth, !!parseQuery(req, query).includeInactive),
);

export const POST = tenantRoute({ permission: "settings.manage" }, async ({ req, auth }) =>
  created(await createTaxRate(auth, await parseBody(req, taxRateSchema))),
);
