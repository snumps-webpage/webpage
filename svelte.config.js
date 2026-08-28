import adapter from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { mdsvex } from "mdsvex";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // .svx = markdown content compiled at BUILD time (BE-62 / API-SPEC §Phase 5):
  // the public zone's static documents cost nothing at runtime.
  extensions: [".svelte", ".svx"],
  preprocess: [vitePreprocess(), mdsvex({ extensions: [".svx"] })],

  kit: {
    adapter: adapter({
      runtime: "nodejs22.x",
    }),
    alias: {
      $content: "src/content",
    },
  },
};

export default config;
