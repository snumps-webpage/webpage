import * as server from '../entries/pages/events/_id_/_type_/_page.server.ts.js';

export const index = 7;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/events/_id_/_type_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/events/[id]/[type]/+page.server.ts";
export const imports = ["_app/immutable/nodes/7.BQUDe3XM.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DgK-BC5G.js","_app/immutable/chunks/DqhKl33E.js","_app/immutable/chunks/CDEWUm48.js","_app/immutable/chunks/B0VApRkq.js","_app/immutable/chunks/q8Ta_Hl5.js","_app/immutable/chunks/C45_Yydf.js"];
export const stylesheets = ["_app/immutable/assets/7.RCNLQnB3.css"];
export const fonts = [];
