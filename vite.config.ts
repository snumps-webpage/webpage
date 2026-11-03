import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  ssr: {
    // The security-patched sanitizer is CommonJS importing an ESM parser.
    // Bundle that boundary for Node 22 runtimes without require(esm).
    noExternal: ["sanitize-html"],
  },
  build: {
    sourcemap: false,
  },
});
