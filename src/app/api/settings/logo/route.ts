import { tenantRoute } from "@/lib/api/handler";
import { readImageField } from "@/lib/upload/cloudinary";
import { removeLogo, uploadLogo } from "@/controller/settings/controller";

export const POST = tenantRoute({ permission: "settings.manage" }, async ({ req, auth }) =>
  uploadLogo(auth, await readImageField(req)),
);

export const DELETE = tenantRoute({ permission: "settings.manage" }, async ({ auth }) => removeLogo(auth));
