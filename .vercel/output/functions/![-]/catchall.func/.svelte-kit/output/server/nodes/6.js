import * as server from '../entries/pages/admin/events/new/_page.server.ts.js';

export const index = 6;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/admin/events/new/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/admin/events/new/+page.server.ts";
export const imports = ["_app/immutable/nodes/6.B9KhmWLM.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DU_ekRCD.js","_app/immutable/chunks/DIudZohJ.js","_app/immutable/chunks/B3tms6QS.js","_app/immutable/chunks/Db7R9tDI.js","_app/immutable/chunks/DxaIkphV.js","_app/immutable/chunks/w45FNyLC.js","_app/immutable/chunks/DXvVQF7f.js","_app/immutable/chunks/ib5IoMGJ.js"];
export const stylesheets = ["_app/immutable/assets/6.XnsUOFzJ.css"];
export const fonts = [];
