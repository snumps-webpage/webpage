import * as server from '../entries/pages/events/_id_/_type_/_page.server.ts.js';

export const index = 7;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/events/_id_/_type_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/events/[id]/[type]/+page.server.ts";
export const imports = ["_app/immutable/nodes/7.DM_wf4A-.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/CPoZX9-G.js","_app/immutable/chunks/D7QZzgua.js","_app/immutable/chunks/V9m303sa.js","_app/immutable/chunks/Ck9SLeDE.js","_app/immutable/chunks/6rsEEj7P.js","_app/immutable/chunks/C-XpXzlh.js"];
export const stylesheets = ["_app/immutable/assets/7.RCNLQnB3.css"];
export const fonts = [];
