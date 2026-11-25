import { z } from "zod";
import { optionalText, uuid } from "./common";

export const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Password must contain letters and numbers");

const email = z.string().trim().toLowerCase().email().max(255);

export const businessTypes = [
  "GROCERY",
  "FASHION",
  "ELECTRONICS",
  "COSMETICS",
  "CONVENIENCE",
  "FOOD",
  "GENERAL",
  "OTHER",
] as const;

export const registerSchema = z.object({
  businessName: z.string().trim().min(2).max(255),
  businessType: z.enum(businessTypes).default("GENERAL"),
  ownerName: z.string().trim().min(2).max(255),
  email,
  password,
  phone: optionalText(30),
  // locale preferences — all optional, all changeable later in Settings
  currencyCode: z.string().trim().length(3).toUpperCase().optional(),
  currencySymbol: z.string().trim().min(1).max(8).optional(),
  locale: z.string().trim().min(2).max(20).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  calendarSystem: z.enum(["AD", "BS"]).optional(),
  taxLabel: z.string().trim().min(1).max(30).optional(),
  defaultTaxRate: z.coerce.number().min(0).max(100).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export type LoginInput = z.infer<typeof loginSchema>;

export const switchLocationSchema = z.object({ locationId: uuid });

export const forgotPasswordSchema = z.object({ email });
export const verifyResetCodeSchema = z.object({ email, code: z.string().regex(/^\d{6}$/) });
export const resetPasswordSchema = verifyResetCodeSchema.extend({ newPassword: password });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const platformLoginSchema = loginSchema;
