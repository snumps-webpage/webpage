import { z } from "zod";
import { Id, SourceRequestId } from "./common";

/** 🔒 PII table. Never reaches any public load (API-SPEC §3). */
export const PrivateInfoSchema = z.object({
  id: Id,
  memberId: Id, // canonical direction of the member↔private-info relation
  email: z.string().email(), // login matching key (unique)
  phone: z.string(),
  background: z.string(),
  // Per-type mail preferences; one key today, more types add keys (not a migration).
  mailPrefs: z.object({ announcements: z.boolean() }),
  sourceRequestId: SourceRequestId,
});

export type PrivateInfo = z.infer<typeof PrivateInfoSchema>;
