import * as server from '../entries/pages/admin/events/new/_page.server.ts.js';

export const index = 6;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/admin/events/new/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/admin/events/new/+page.server.ts";
export const imports = ["_app/immutable/nodes/6.CzJY4IBH.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/CPoZX9-G.js","_app/immutable/chunks/D7QZzgua.js","_app/immutable/chunks/CS7fZLNp.js","_app/immutable/chunks/DwZ0Ymmn.js","_app/immutable/chunks/D3_0RLCe.js","_app/immutable/chunks/6rsEEj7P.js","_app/immutable/chunks/Z-JQUfLR.js","_app/immutable/chunks/BMs8cn36.js"];
export const stylesheets = ["_app/immutable/assets/6.XnsUOFzJ.css"];
export const fonts = [];
