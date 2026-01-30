import * as server from '../entries/pages/signup/_page.server.ts.js';

export const index = 10;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/signup/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/signup/+page.server.ts";
export const imports = ["_app/immutable/nodes/10.BKMduYZo.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/CPoZX9-G.js","_app/immutable/chunks/D7QZzgua.js","_app/immutable/chunks/DfuNISpg.js","_app/immutable/chunks/DbX98UqT.js","_app/immutable/chunks/BMs8cn36.js"];
export const stylesheets = ["_app/immutable/assets/10.BwFrMkiL.css"];
export const fonts = [];
