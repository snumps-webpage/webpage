import * as server from '../entries/pages/wait/_page.server.ts.js';

export const index = 12;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/wait/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/wait/+page.server.ts";
export const imports = ["_app/immutable/nodes/12.C7tybUgO.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/B5cnx04j.js","_app/immutable/chunks/BJxTeaXq.js","_app/immutable/chunks/D4RMClQu.js","_app/immutable/chunks/BquhoHsf.js"];
export const stylesheets = ["_app/immutable/assets/12.frCcfQ-Q.css"];
export const fonts = [];
