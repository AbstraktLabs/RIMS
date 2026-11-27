import { tenantRoute } from "@/lib/api/handler";
import { saleVoucherStats } from "@/controller/vouchers/sales";

export const GET = tenantRoute({ permission: "sales.view" }, async ({ auth }) => saleVoucherStats(auth));
