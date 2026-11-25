import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { updatePartySchema } from "@/lib/validation/parties";
import { deleteParty, getParty, updateParty } from "@/controller/parties/controller";

export const GET = tenantRoute(
  { permission: ["parties.view", "sales.manage", "purchases.manage"] },
  async ({ params, auth }) => getParty(auth, idParam(params)),
);

export const PATCH = tenantRoute({ permission: "parties.manage" }, async ({ req, params, auth }) =>
  updateParty(auth, idParam(params), await parseBody(req, updatePartySchema)),
);

export const DELETE = tenantRoute({ permission: "parties.manage" }, async ({ params, auth }) =>
  deleteParty(auth, idParam(params)),
);
