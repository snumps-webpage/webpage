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
      // Vercel 이미지 최적화(/_vercel/image) — 갤러리 그리드가 원본(수 MB)을
      // 엣지 리사이즈+WebP로 받게 한다. 원본 파일은 손대지 않는다.
      images: {
        sizes: [480, 640, 960, 1280],
        formats: ["image/webp"],
        minimumCacheTTL: 60 * 60 * 24 * 30,
        domains: ["rwlvnttpaqkhpebtebif.supabase.co", "gcahkryexewswzvtfltj.supabase.co"],
      },
    }),
    alias: {
      $content: "src/content",
    },
  },
};

export default config;
