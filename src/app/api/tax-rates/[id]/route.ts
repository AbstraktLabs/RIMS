import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { updateTaxRateSchema } from "@/lib/validation/settings";
import { deleteTaxRate, updateTaxRate } from "@/controller/settings/controller";

export const PATCH = tenantRoute({ permission: "settings.manage" }, async ({ req, params, auth }) =>
  updateTaxRate(auth, idParam(params), await parseBody(req, updateTaxRateSchema)),
);

export const DELETE = tenantRoute({ permission: "settings.manage" }, async ({ params, auth }) =>
  deleteTaxRate(auth, idParam(params)),
);
