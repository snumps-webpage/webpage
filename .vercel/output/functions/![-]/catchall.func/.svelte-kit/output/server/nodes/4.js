import * as server from '../entries/pages/admin/_page.server.ts.js';

export const index = 4;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/admin/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/admin/+page.server.ts";
export const imports = ["_app/immutable/nodes/4.CY0P0M9B.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/Q4okwBRW.js","_app/immutable/chunks/DVKXU0uP.js","_app/immutable/chunks/jTduhY3c.js","_app/immutable/chunks/C1qvZ1PC.js","_app/immutable/chunks/OxNPqDJp.js","_app/immutable/chunks/B6HYV5AO.js","_app/immutable/chunks/DhzMewF5.js","_app/immutable/chunks/BwwXhXbI.js","_app/immutable/chunks/DUQvWMZA.js","_app/immutable/chunks/BGTIHzGT.js","_app/immutable/chunks/CYabC2A3.js","_app/immutable/chunks/Dv_2zJX9.js","_app/immutable/chunks/B0iYuyRe.js","_app/immutable/chunks/lvcK3B9m.js","_app/immutable/chunks/DxsF6dg8.js"];
export const stylesheets = ["_app/immutable/assets/Skeleton.Cj1A1n8x.css","_app/immutable/assets/4.DnS-Zldy.css"];
export const fonts = [];
