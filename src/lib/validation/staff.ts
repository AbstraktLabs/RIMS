import { z } from "zod";
import { password } from "./auth";
import { nullableText, uuid } from "./common";

const assignments = z
  .array(z.object({ locationId: uuid, roleId: uuid }))
  .min(1, "Assign the staff member to at least one location")
  .max(200)
  .refine((a) => new Set(a.map((x) => x.locationId)).size === a.length, "Each location can be assigned only once");

export const createStaffSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: nullableText(30),
  // leave empty to generate a temporary password
  password: password.optional(),
  assignments,
  sendWelcomeEmail: z.boolean().default(true),
});

export const updateStaffSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  phone: nullableText(30),
  isActive: z.boolean().optional(),
  assignments: assignments.optional(),
});

export const listStaffQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["active", "inactive", "all"]).default("all"),
});
