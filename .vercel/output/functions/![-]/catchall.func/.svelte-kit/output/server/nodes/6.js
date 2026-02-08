import * as server from '../entries/pages/admin/events/new/_page.server.ts.js';

export const index = 6;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/admin/events/new/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/admin/events/new/+page.server.ts";
export const imports = ["_app/immutable/nodes/6.BW8lLdd1.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DgK-BC5G.js","_app/immutable/chunks/DqhKl33E.js","_app/immutable/chunks/CWz7DQAJ.js","_app/immutable/chunks/CDEWUm48.js","_app/immutable/chunks/B0VApRkq.js","_app/immutable/chunks/q8Ta_Hl5.js","_app/immutable/chunks/C45_Yydf.js","_app/immutable/chunks/QEewnBXe.js"];
export const stylesheets = ["_app/immutable/assets/6.XnsUOFzJ.css"];
export const fonts = [];
