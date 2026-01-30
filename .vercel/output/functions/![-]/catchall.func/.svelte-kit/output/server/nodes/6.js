import * as server from '../entries/pages/admin/events/new/_page.server.ts.js';

export const index = 6;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/admin/events/new/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/admin/events/new/+page.server.ts";
export const imports = ["_app/immutable/nodes/6.Brs3gxcR.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/B5cnx04j.js","_app/immutable/chunks/BJxTeaXq.js","_app/immutable/chunks/U5XgkQ5N.js","_app/immutable/chunks/C_bhV80f.js","_app/immutable/chunks/BhxLg99C.js","_app/immutable/chunks/BkpQ8gsr.js","_app/immutable/chunks/gviOWbYU.js","_app/immutable/chunks/DWPjaIqu.js","_app/immutable/chunks/BquhoHsf.js","_app/immutable/chunks/B4HH5KP-.js"];
export const stylesheets = ["_app/immutable/assets/6.XnsUOFzJ.css"];
export const fonts = [];
