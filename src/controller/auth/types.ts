import type { z } from "zod";
import type {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyResetCodeSchema,
} from "@/lib/validation/auth";

export type RegisterInputT = z.infer<typeof registerSchema>;
export type LoginInputT = z.infer<typeof loginSchema>;
export type VerifyResetCodeInputT = z.infer<typeof verifyResetCodeSchema>;
export type ResetPasswordInputT = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInputT = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInputT = z.infer<typeof changePasswordSchema>;
