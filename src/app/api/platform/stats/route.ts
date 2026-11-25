import { platformRoute } from "@/lib/api/handler";
import { platformStats } from "@/controller/platform/controller";

export const GET = platformRoute(async () => platformStats());
