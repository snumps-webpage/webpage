import * as server from '../entries/pages/notion/_page.server.ts.js';

export const index = 8;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/notion/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/notion/+page.server.ts";
export const imports = ["_app/immutable/nodes/8.DqPwhexC.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DgK-BC5G.js","_app/immutable/chunks/DqhKl33E.js","_app/immutable/chunks/D5HJUt-u.js","_app/immutable/chunks/BrURPvaF.js","_app/immutable/chunks/CWz7DQAJ.js","_app/immutable/chunks/QEewnBXe.js","_app/immutable/chunks/C64WF8d8.js","_app/immutable/chunks/CZBwn89t.js"];
export const stylesheets = ["_app/immutable/assets/8.DdgYZB7E.css"];
export const fonts = [];
