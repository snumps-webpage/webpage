import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
    environment: "jsdom",
    // One initialized PGlite snapshot per run; each file loads it instead of
    // running initdb (src/lib/server/data/pglite-snapshot.setup.ts).
    globalSetup: ["src/lib/server/data/pglite-snapshot.setup.ts"],
    setupFiles: ["src/lib/server/data/pglite-warmup.setup.ts"],
  },
});
