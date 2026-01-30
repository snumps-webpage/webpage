import * as server from '../entries/pages/events/_id_/_type_/_page.server.ts.js';

export const index = 7;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/events/_id_/_type_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/events/[id]/[type]/+page.server.ts";
export const imports = ["_app/immutable/nodes/7.COBMkR9x.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/Q4okwBRW.js","_app/immutable/chunks/DVKXU0uP.js","_app/immutable/chunks/B6HYV5AO.js","_app/immutable/chunks/DhzMewF5.js","_app/immutable/chunks/BwwXhXbI.js","_app/immutable/chunks/DUQvWMZA.js","_app/immutable/chunks/C1qvZ1PC.js","_app/immutable/chunks/BGTIHzGT.js"];
export const stylesheets = ["_app/immutable/assets/7.RCNLQnB3.css"];
export const fonts = [];
