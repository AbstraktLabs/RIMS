import { parseQuery, platformRoute } from "@/lib/api/handler";
import { listOrganizations, listOrganizationsQuery } from "@/controller/platform/controller";

export const GET = platformRoute(async ({ req }) => listOrganizations(parseQuery(req, listOrganizationsQuery)));
