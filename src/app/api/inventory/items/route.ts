import { tenantRoute } from "@/lib/api/handler";
import { listItems } from "@/controller/catalog/items";

export const GET = tenantRoute({ permission: "products.view" }, async ({ auth }) => listItems(auth));
