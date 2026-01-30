import * as server from '../entries/pages/wait/_page.server.ts.js';

export const index = 12;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/wait/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/wait/+page.server.ts";
export const imports = ["_app/immutable/nodes/12.D0ahDaL0.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/Q4okwBRW.js","_app/immutable/chunks/DVKXU0uP.js","_app/immutable/chunks/BEEFFNKM.js","_app/immutable/chunks/BGTIHzGT.js"];
export const stylesheets = ["_app/immutable/assets/12.frCcfQ-Q.css"];
export const fonts = [];
