import * as server from '../entries/pages/notion/_page.server.ts.js';

export const index = 8;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/notion/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/notion/+page.server.ts";
export const imports = ["_app/immutable/nodes/8.WRp8tSWt.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/CPoZX9-G.js","_app/immutable/chunks/D7QZzgua.js","_app/immutable/chunks/DfuNISpg.js","_app/immutable/chunks/DbX98UqT.js","_app/immutable/chunks/CS7fZLNp.js","_app/immutable/chunks/BMs8cn36.js","_app/immutable/chunks/BgZBNSJJ.js","_app/immutable/chunks/CYUQJdtP.js"];
export const stylesheets = ["_app/immutable/assets/8.DdgYZB7E.css"];
export const fonts = [];
