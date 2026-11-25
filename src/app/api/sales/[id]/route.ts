import { idParam, tenantRoute } from "@/lib/api/handler";
import { getSale } from "@/controller/sales/sales";

// Posted sales are never edited or deleted — void or return instead.
export const GET = tenantRoute({ permission: "sales.view" }, async ({ params, auth }) => getSale(auth, idParam(params)));
