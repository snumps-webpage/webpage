import * as server from '../entries/pages/events/_id_/_type_/_page.server.ts.js';

export const index = 7;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/events/_id_/_type_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/events/[id]/[type]/+page.server.ts";
export const imports = ["_app/immutable/nodes/7.BouvO-aQ.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/B5cnx04j.js","_app/immutable/chunks/BJxTeaXq.js","_app/immutable/chunks/C_bhV80f.js","_app/immutable/chunks/BhxLg99C.js","_app/immutable/chunks/BkpQ8gsr.js","_app/immutable/chunks/gviOWbYU.js","_app/immutable/chunks/DWPjaIqu.js","_app/immutable/chunks/BquhoHsf.js"];
export const stylesheets = ["_app/immutable/assets/7.RCNLQnB3.css"];
export const fonts = [];
