import { idParam, tenantRoute } from "@/lib/api/handler";
import { voidPayment } from "@/controller/finance/payments";

export const POST = tenantRoute({ permission: "finance.manage" }, async ({ params, auth }) => voidPayment(auth, idParam(params)));
