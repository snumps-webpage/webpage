import * as server from '../entries/pages/seminar/apply/_page.server.ts.js';

export const index = 9;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/seminar/apply/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/seminar/apply/+page.server.ts";
export const imports = ["_app/immutable/nodes/9.CtWvDFGv.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/CPoZX9-G.js","_app/immutable/chunks/D7QZzgua.js","_app/immutable/chunks/DfuNISpg.js","_app/immutable/chunks/DbX98UqT.js","_app/immutable/chunks/CS7fZLNp.js","_app/immutable/chunks/V9m303sa.js","_app/immutable/chunks/Ck9SLeDE.js","_app/immutable/chunks/6rsEEj7P.js","_app/immutable/chunks/C-XpXzlh.js","_app/immutable/chunks/BMs8cn36.js","_app/immutable/chunks/CYUQJdtP.js"];
export const stylesheets = ["_app/immutable/assets/9.C6eTe3e4.css"];
export const fonts = [];
