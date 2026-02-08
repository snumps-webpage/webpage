import * as server from '../entries/pages/admin/events/new/_layout.server.ts.js';

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/layout.svelte.js')).default;
export { server };
export const server_id = "src/routes/admin/events/new/+layout.server.ts";
export const imports = ["_app/immutable/nodes/2.DOVBXCWQ.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DgK-BC5G.js","_app/immutable/chunks/DmlEswr8.js","_app/immutable/chunks/BrURPvaF.js"];
export const stylesheets = [];
export const fonts = [];
