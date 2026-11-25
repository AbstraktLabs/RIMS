import { platformRoute } from "@/lib/api/handler";
import { platformMe } from "@/controller/platform/controller";

export const GET = platformRoute(async ({ admin }) => platformMe(admin.superAdminId));
