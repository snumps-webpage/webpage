import * as server from '../entries/pages/notion/_page.server.ts.js';

export const index = 8;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/notion/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/notion/+page.server.ts";
export const imports = ["_app/immutable/nodes/8.C4rQ006x.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DU_ekRCD.js","_app/immutable/chunks/DIudZohJ.js","_app/immutable/chunks/Di2yoJI-.js","_app/immutable/chunks/_k-4L2bP.js","_app/immutable/chunks/B3tms6QS.js","_app/immutable/chunks/ib5IoMGJ.js","_app/immutable/chunks/Bbjxasbd.js","_app/immutable/chunks/F3PrrU7D.js"];
export const stylesheets = ["_app/immutable/assets/8.DdgYZB7E.css"];
export const fonts = [];
