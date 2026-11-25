import { parseBody, tenantRoute } from "@/lib/api/handler";
import { updateSequenceSchema } from "@/lib/validation/settings";
import { listSequences, updateSequence } from "@/controller/settings/controller";

export const GET = tenantRoute({ permission: "settings.view" }, async ({ auth }) => listSequences(auth));

export const PATCH = tenantRoute({ permission: "settings.manage" }, async ({ req, auth }) =>
  updateSequence(auth, await parseBody(req, updateSequenceSchema)),
);
