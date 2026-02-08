import * as server from '../entries/pages/admin/events/connect/_page.server.ts.js';

export const index = 5;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/admin/events/connect/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/admin/events/connect/+page.server.ts";
export const imports = ["_app/immutable/nodes/5.Bu75v3Km.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DgK-BC5G.js","_app/immutable/chunks/DqhKl33E.js","_app/immutable/chunks/D5HJUt-u.js","_app/immutable/chunks/BrURPvaF.js","_app/immutable/chunks/CWz7DQAJ.js","_app/immutable/chunks/CSGqiy0b.js","_app/immutable/chunks/cJSwdI16.js","_app/immutable/chunks/q8Ta_Hl5.js","_app/immutable/chunks/D8JRFWdv.js","_app/immutable/chunks/QEewnBXe.js","_app/immutable/chunks/C64WF8d8.js","_app/immutable/chunks/CZBwn89t.js","_app/immutable/chunks/zar0zCqa.js"];
export const stylesheets = ["_app/immutable/assets/5.ChFcB0Ou.css"];
export const fonts = [];
