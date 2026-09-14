/**
 * Global type definitions for the SvelteKit application.
 */
import type { Session } from "@auth/core/types";

declare global {
  namespace App {
    interface Locals {
      auth: () => Promise<Session | null>;
      /** Resolved by the zone guard: undefined = not resolved, null = not a member */
      member?: import("./lib/server/guards/zone").MemberContext | null;
      /** Request-level cache for application info (legacy — removed at M3) */
      userApplication?: import("./lib/server/admin").Application | null;
    }
    interface PageData {
      session: Session | null;
    }
    /** handleError adds a machine-readable code so /api errors fit the REST envelope (W-22). */
    interface Error {
      message: string;
      error?: import("./lib/domain/api").ApiErrorCode;
    }
  }
}

declare module "@auth/core/types" {
  interface Session {
    accessToken?: string;
  }
}

export {};
