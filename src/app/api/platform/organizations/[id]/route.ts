import { idParam, parseBody, platformRoute } from "@/lib/api/handler";
import { getOrganization, updateOrganization, updateOrganizationSchema } from "@/controller/platform/controller";

export const GET = platformRoute(async ({ params }) => getOrganization(idParam(params)));

export const PATCH = platformRoute(async ({ req, params }) =>
  updateOrganization(idParam(params), await parseBody(req, updateOrganizationSchema)),
);
