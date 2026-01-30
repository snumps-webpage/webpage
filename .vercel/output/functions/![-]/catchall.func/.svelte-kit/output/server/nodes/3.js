import * as server from '../entries/pages/_page.server.ts.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.ts";
export const imports = ["_app/immutable/nodes/3.DP_PcOB0.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/Q4okwBRW.js","_app/immutable/chunks/DVKXU0uP.js","_app/immutable/chunks/DUQvWMZA.js","_app/immutable/chunks/C1qvZ1PC.js","_app/immutable/chunks/jTduhY3c.js","_app/immutable/chunks/OxNPqDJp.js","_app/immutable/chunks/B6HYV5AO.js","_app/immutable/chunks/DhzMewF5.js","_app/immutable/chunks/BwwXhXbI.js","_app/immutable/chunks/BGTIHzGT.js","_app/immutable/chunks/CYabC2A3.js","_app/immutable/chunks/Dv_2zJX9.js","_app/immutable/chunks/B0iYuyRe.js","_app/immutable/chunks/lvcK3B9m.js","_app/immutable/chunks/DSTApLi5.js","_app/immutable/chunks/BRJwBp5h.js","_app/immutable/chunks/BEEFFNKM.js"];
export const stylesheets = ["_app/immutable/assets/Skeleton.Cj1A1n8x.css","_app/immutable/assets/3.Cvak83dK.css"];
export const fonts = [];
