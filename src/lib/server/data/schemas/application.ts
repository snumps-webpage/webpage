import { z } from "zod";
import { DateTime, Id } from "./common";

/**
 * 🔒 Holds ONLY unprocessed applications — no status field.
 * Approval converts the row into members/private-info and removes it;
 * rejection and self-withdrawal remove it too (API-SPEC §2).
 */
export const ApplicationSchema = z.object({
  id: Id,
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string(),
  department: z.string(),
  background: z.string(),
  createdAt: DateTime,
});

export type Application = z.infer<typeof ApplicationSchema>;
