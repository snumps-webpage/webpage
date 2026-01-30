import * as server from '../entries/pages/admin/events/connect/_page.server.ts.js';

export const index = 5;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/admin/events/connect/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/admin/events/connect/+page.server.ts";
export const imports = ["_app/immutable/nodes/5.De6N9p0O.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/Q4okwBRW.js","_app/immutable/chunks/DVKXU0uP.js","_app/immutable/chunks/jTduhY3c.js","_app/immutable/chunks/C1qvZ1PC.js","_app/immutable/chunks/OxNPqDJp.js","_app/immutable/chunks/B6HYV5AO.js","_app/immutable/chunks/DhzMewF5.js","_app/immutable/chunks/BwwXhXbI.js","_app/immutable/chunks/DUQvWMZA.js","_app/immutable/chunks/BGTIHzGT.js","_app/immutable/chunks/CYabC2A3.js","_app/immutable/chunks/Dv_2zJX9.js","_app/immutable/chunks/CYHXBV-x.js","_app/immutable/chunks/DSTApLi5.js"];
export const stylesheets = ["_app/immutable/assets/5.ChFcB0Ou.css"];
export const fonts = [];
