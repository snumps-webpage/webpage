import * as server from '../entries/pages/admin/_page.server.ts.js';

export const index = 4;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/admin/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/admin/+page.server.ts";
export const imports = ["_app/immutable/nodes/4.DrwkqeBO.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DgK-BC5G.js","_app/immutable/chunks/DqhKl33E.js","_app/immutable/chunks/D5HJUt-u.js","_app/immutable/chunks/BrURPvaF.js","_app/immutable/chunks/CWz7DQAJ.js","_app/immutable/chunks/CSGqiy0b.js","_app/immutable/chunks/cJSwdI16.js","_app/immutable/chunks/q8Ta_Hl5.js","_app/immutable/chunks/D8JRFWdv.js","_app/immutable/chunks/QEewnBXe.js","_app/immutable/chunks/C64WF8d8.js","_app/immutable/chunks/BQ3DPt1T.js","_app/immutable/chunks/DYAAFN1B.js","_app/immutable/chunks/iguBTSUX.js"];
export const stylesheets = ["_app/immutable/assets/Skeleton.Cj1A1n8x.css","_app/immutable/assets/4.DnS-Zldy.css"];
export const fonts = [];
