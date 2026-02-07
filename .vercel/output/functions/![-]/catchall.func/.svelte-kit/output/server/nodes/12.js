import * as server from '../entries/pages/wait/_page.server.ts.js';

export const index = 12;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/wait/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/wait/+page.server.ts";
export const imports = ["_app/immutable/nodes/12.BtRkX6kM.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/CPoZX9-G.js","_app/immutable/chunks/D7QZzgua.js","_app/immutable/chunks/DuQwUNOY.js","_app/immutable/chunks/Z-JQUfLR.js"];
export const stylesheets = ["_app/immutable/assets/12.frCcfQ-Q.css"];
export const fonts = [];
