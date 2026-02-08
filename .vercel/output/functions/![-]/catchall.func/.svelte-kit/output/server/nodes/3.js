import * as server from '../entries/pages/_page.server.ts.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.ts";
export const imports = ["_app/immutable/nodes/3.CqZZdQKp.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DgK-BC5G.js","_app/immutable/chunks/DqhKl33E.js","_app/immutable/chunks/DmlEswr8.js","_app/immutable/chunks/BrURPvaF.js","_app/immutable/chunks/D5HJUt-u.js","_app/immutable/chunks/CWz7DQAJ.js","_app/immutable/chunks/CSGqiy0b.js","_app/immutable/chunks/cJSwdI16.js","_app/immutable/chunks/q8Ta_Hl5.js","_app/immutable/chunks/D8JRFWdv.js","_app/immutable/chunks/QEewnBXe.js","_app/immutable/chunks/C64WF8d8.js","_app/immutable/chunks/BQ3DPt1T.js","_app/immutable/chunks/DYAAFN1B.js","_app/immutable/chunks/zar0zCqa.js","_app/immutable/chunks/FG2Tue-4.js","_app/immutable/chunks/BMEtXec4.js"];
export const stylesheets = ["_app/immutable/assets/Skeleton.Cj1A1n8x.css","_app/immutable/assets/3.Cvak83dK.css"];
export const fonts = [];
