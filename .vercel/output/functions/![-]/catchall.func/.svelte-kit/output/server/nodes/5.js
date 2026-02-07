import * as server from '../entries/pages/admin/events/connect/_page.server.ts.js';

export const index = 5;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/admin/events/connect/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/admin/events/connect/+page.server.ts";
export const imports = ["_app/immutable/nodes/5.CSj0wIjA.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/CPoZX9-G.js","_app/immutable/chunks/D7QZzgua.js","_app/immutable/chunks/DfuNISpg.js","_app/immutable/chunks/DbX98UqT.js","_app/immutable/chunks/CS7fZLNp.js","_app/immutable/chunks/DwZ0Ymmn.js","_app/immutable/chunks/D3_0RLCe.js","_app/immutable/chunks/6rsEEj7P.js","_app/immutable/chunks/Z-JQUfLR.js","_app/immutable/chunks/BMs8cn36.js","_app/immutable/chunks/BgZBNSJJ.js","_app/immutable/chunks/CYUQJdtP.js","_app/immutable/chunks/Ca8cI1Kw.js"];
export const stylesheets = ["_app/immutable/assets/5.ChFcB0Ou.css"];
export const fonts = [];
