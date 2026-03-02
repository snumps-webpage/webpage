/**
 * Entry point for the Mail service.
 * Re-exports notification templates for use across the application.
 */
export * from "./mail/templates";
export { getAdminAccessToken, dispatchEmail } from "./mail/client";
