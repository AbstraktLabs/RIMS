import { z } from "zod";
import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { booleanString } from "@/lib/validation/common";
import { locationSchema } from "@/lib/validation/settings";
import { createLocation, listLocations } from "@/controller/settings/controller";

const query = z.object({ includeInactive: booleanString.optional() });

export const GET = tenantRoute({}, async ({ req, auth }) =>
  listLocations(auth, !!parseQuery(req, query).includeInactive),
);

export const POST = tenantRoute({ permission: "settings.manage" }, async ({ req, auth }) =>
  created(await createLocation(auth, await parseBody(req, locationSchema))),
);
