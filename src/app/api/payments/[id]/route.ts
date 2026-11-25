import { idParam, tenantRoute } from "@/lib/api/handler";
import { getPayment } from "@/controller/finance/payments";

export const GET = tenantRoute({ permission: "finance.view" }, async ({ params, auth }) => getPayment(auth, idParam(params)));
