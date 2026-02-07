import * as server from '../entries/pages/admin/_page.server.ts.js';

export const index = 4;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/admin/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/admin/+page.server.ts";
export const imports = ["_app/immutable/nodes/4.DUgETZd5.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/CPoZX9-G.js","_app/immutable/chunks/D7QZzgua.js","_app/immutable/chunks/DfuNISpg.js","_app/immutable/chunks/DbX98UqT.js","_app/immutable/chunks/CS7fZLNp.js","_app/immutable/chunks/DwZ0Ymmn.js","_app/immutable/chunks/D3_0RLCe.js","_app/immutable/chunks/6rsEEj7P.js","_app/immutable/chunks/Z-JQUfLR.js","_app/immutable/chunks/BMs8cn36.js","_app/immutable/chunks/BgZBNSJJ.js","_app/immutable/chunks/1FXSubPY.js","_app/immutable/chunks/CMg1NZo6.js","_app/immutable/chunks/DJosleyX.js"];
export const stylesheets = ["_app/immutable/assets/Skeleton.Cj1A1n8x.css","_app/immutable/assets/4.DnS-Zldy.css"];
export const fonts = [];
