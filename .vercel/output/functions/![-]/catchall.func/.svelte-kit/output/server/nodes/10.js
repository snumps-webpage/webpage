import * as server from '../entries/pages/signup/_page.server.ts.js';

export const index = 10;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/signup/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/signup/+page.server.ts";
export const imports = ["_app/immutable/nodes/10.hnrhugS2.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/B5cnx04j.js","_app/immutable/chunks/BJxTeaXq.js","_app/immutable/chunks/Bj63PGj9.js","_app/immutable/chunks/DWPjaIqu.js","_app/immutable/chunks/B4HH5KP-.js"];
export const stylesheets = ["_app/immutable/assets/10.BwFrMkiL.css"];
export const fonts = [];
