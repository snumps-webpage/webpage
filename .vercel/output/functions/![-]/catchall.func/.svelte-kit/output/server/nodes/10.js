import * as server from '../entries/pages/signup/_page.server.ts.js';

export const index = 10;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/signup/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/signup/+page.server.ts";
export const imports = ["_app/immutable/nodes/10.BrfqVcPb.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DU_ekRCD.js","_app/immutable/chunks/DIudZohJ.js","_app/immutable/chunks/Di2yoJI-.js","_app/immutable/chunks/_k-4L2bP.js","_app/immutable/chunks/ib5IoMGJ.js"];
export const stylesheets = ["_app/immutable/assets/10.BwFrMkiL.css"];
export const fonts = [];
