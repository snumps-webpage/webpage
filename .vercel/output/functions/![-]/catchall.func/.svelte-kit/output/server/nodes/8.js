import * as server from '../entries/pages/notion/_page.server.ts.js';

export const index = 8;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/notion/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/notion/+page.server.ts";
export const imports = ["_app/immutable/nodes/8.B2K19R9R.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/B5cnx04j.js","_app/immutable/chunks/BJxTeaXq.js","_app/immutable/chunks/Bj63PGj9.js","_app/immutable/chunks/DWPjaIqu.js","_app/immutable/chunks/U5XgkQ5N.js","_app/immutable/chunks/B4HH5KP-.js","_app/immutable/chunks/BPlaetVe.js","_app/immutable/chunks/_rr3zna6.js"];
export const stylesheets = ["_app/immutable/assets/8.DdgYZB7E.css"];
export const fonts = [];
