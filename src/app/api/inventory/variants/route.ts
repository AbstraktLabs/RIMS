import { tenantRoute } from "@/lib/api/handler";
import { listSellables } from "@/controller/catalog/items";

// Item pickers on the Purchase and Sales screens: one row per size/colour.
export const GET = tenantRoute({ permission: ["products.view", "sales.manage", "purchases.manage"] }, async ({ auth }) =>
  listSellables(auth),
);
