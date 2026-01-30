import * as server from '../entries/pages/_page.server.ts.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.ts";
export const imports = ["_app/immutable/nodes/3.BwZGZKQb.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/CPoZX9-G.js","_app/immutable/chunks/D7QZzgua.js","_app/immutable/chunks/C3VcCDeh.js","_app/immutable/chunks/DbX98UqT.js","_app/immutable/chunks/DfuNISpg.js","_app/immutable/chunks/CS7fZLNp.js","_app/immutable/chunks/V9m303sa.js","_app/immutable/chunks/Ck9SLeDE.js","_app/immutable/chunks/6rsEEj7P.js","_app/immutable/chunks/C-XpXzlh.js","_app/immutable/chunks/BMs8cn36.js","_app/immutable/chunks/BgZBNSJJ.js","_app/immutable/chunks/1FXSubPY.js","_app/immutable/chunks/CMg1NZo6.js","_app/immutable/chunks/Ca8cI1Kw.js","_app/immutable/chunks/CQKJdOHP.js","_app/immutable/chunks/Bs98Z-RJ.js"];
export const stylesheets = ["_app/immutable/assets/Skeleton.Cj1A1n8x.css","_app/immutable/assets/3.Cvak83dK.css"];
export const fonts = [];
