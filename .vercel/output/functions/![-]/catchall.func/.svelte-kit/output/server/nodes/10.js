import * as server from '../entries/pages/signup/_page.server.ts.js';

export const index = 10;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/signup/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/signup/+page.server.ts";
export const imports = ["_app/immutable/nodes/10.C-t01V8z.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/Q4okwBRW.js","_app/immutable/chunks/DVKXU0uP.js","_app/immutable/chunks/jTduhY3c.js","_app/immutable/chunks/C1qvZ1PC.js","_app/immutable/chunks/CYabC2A3.js"];
export const stylesheets = ["_app/immutable/assets/10.BwFrMkiL.css"];
export const fonts = [];
