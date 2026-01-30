import * as server from '../entries/pages/seminar/apply/_page.server.ts.js';

export const index = 9;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/seminar/apply/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/seminar/apply/+page.server.ts";
export const imports = ["_app/immutable/nodes/9.CdOvt0vj.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DU_ekRCD.js","_app/immutable/chunks/DIudZohJ.js","_app/immutable/chunks/Di2yoJI-.js","_app/immutable/chunks/_k-4L2bP.js","_app/immutable/chunks/B3tms6QS.js","_app/immutable/chunks/Db7R9tDI.js","_app/immutable/chunks/DxaIkphV.js","_app/immutable/chunks/w45FNyLC.js","_app/immutable/chunks/DXvVQF7f.js","_app/immutable/chunks/ib5IoMGJ.js","_app/immutable/chunks/F3PrrU7D.js"];
export const stylesheets = ["_app/immutable/assets/9.C6eTe3e4.css"];
export const fonts = [];
