import * as server from '../entries/pages/seminar/apply/_page.server.ts.js';

export const index = 9;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/seminar/apply/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/seminar/apply/+page.server.ts";
export const imports = ["_app/immutable/nodes/9.Dy6o4n9x.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/Q4okwBRW.js","_app/immutable/chunks/DVKXU0uP.js","_app/immutable/chunks/jTduhY3c.js","_app/immutable/chunks/C1qvZ1PC.js","_app/immutable/chunks/OxNPqDJp.js","_app/immutable/chunks/B6HYV5AO.js","_app/immutable/chunks/DhzMewF5.js","_app/immutable/chunks/BwwXhXbI.js","_app/immutable/chunks/DUQvWMZA.js","_app/immutable/chunks/BGTIHzGT.js","_app/immutable/chunks/CYabC2A3.js","_app/immutable/chunks/CYHXBV-x.js"];
export const stylesheets = ["_app/immutable/assets/9.C6eTe3e4.css"];
export const fonts = [];
