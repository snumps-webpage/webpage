/**
 * Global type definitions for the SvelteKit application.
 */
import type { Session } from '@auth/core/types';

declare global {
	namespace App {
		interface Locals {
			auth: () => Promise<Session | null>;
		}
		interface PageData {
			session: Session | null;
		}
	}
}

export {};
