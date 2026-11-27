import { tenantRoute } from "@/lib/api/handler";
import { getBusiness } from "@/controller/settings/controller";

// Business details for printed documents (invoices, vouchers, reports).
export const GET = tenantRoute({}, async ({ auth }) => {
  const { organization: o } = await getBusiness(auth);
  return {
    organization: {
      businessName: o.name,
      panVatNumber: o.taxId,
      address: o.address,
      phone: o.phone,
      email: o.email,
      logoUrl: o.logoUrl,
    },
  };
});
