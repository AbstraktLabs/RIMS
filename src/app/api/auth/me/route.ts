import { tenantRoute } from "@/lib/api/handler";
import { me } from "@/controller/auth/controller";

export const GET = tenantRoute({}, async ({ auth }) => me(auth.userId, auth.locationId));
