/**
 * Global type definitions for the SvelteKit application.
 */
import type { Session } from "@auth/core/types";

declare global {
  namespace App {
    interface Locals {
      auth: () => Promise<Session | null>;
      /** Request-level cache for member info */
      member?: { privateInfoId: string; memberId: string } | null;
      /** Request-level cache for application info */
      userApplication?: import("./lib/server/admin").Application | null;
    }
    interface PageData {
      session: Session | null;
    }
  }
}

declare module "@auth/core/types" {
  interface Session {
    accessToken?: string;
  }
}

export {};
