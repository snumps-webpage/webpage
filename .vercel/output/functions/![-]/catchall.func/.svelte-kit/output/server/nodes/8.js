import * as server from '../entries/pages/notion/_page.server.ts.js';

export const index = 8;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/notion/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/notion/+page.server.ts";
export const imports = ["_app/immutable/nodes/8.CcaVu7j1.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/Q4okwBRW.js","_app/immutable/chunks/DVKXU0uP.js","_app/immutable/chunks/jTduhY3c.js","_app/immutable/chunks/C1qvZ1PC.js","_app/immutable/chunks/OxNPqDJp.js","_app/immutable/chunks/CYabC2A3.js","_app/immutable/chunks/Dv_2zJX9.js","_app/immutable/chunks/CYHXBV-x.js"];
export const stylesheets = ["_app/immutable/assets/8.DdgYZB7E.css"];
export const fonts = [];
