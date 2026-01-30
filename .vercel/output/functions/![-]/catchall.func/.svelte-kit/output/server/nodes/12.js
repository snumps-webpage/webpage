import * as server from '../entries/pages/wait/_page.server.ts.js';

export const index = 12;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/wait/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/wait/+page.server.ts";
export const imports = ["_app/immutable/nodes/12.C5UG24xu.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DU_ekRCD.js","_app/immutable/chunks/DIudZohJ.js","_app/immutable/chunks/lNikU23B.js","_app/immutable/chunks/DXvVQF7f.js"];
export const stylesheets = ["_app/immutable/assets/12.frCcfQ-Q.css"];
export const fonts = [];
