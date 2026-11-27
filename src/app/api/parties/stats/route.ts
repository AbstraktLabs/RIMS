import { z } from "zod";
import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { partyStats } from "@/controller/parties/controller";

const query = z.object({ type: z.enum(["SUPPLIER", "CUSTOMER", "BOTH"]).optional() });

export const GET = tenantRoute({ permission: "parties.view" }, async ({ req, auth }) => partyStats(auth, parseQuery(req, query).type));
