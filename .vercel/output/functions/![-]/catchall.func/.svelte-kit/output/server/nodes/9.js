import * as server from '../entries/pages/seminar/apply/_page.server.ts.js';

export const index = 9;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/seminar/apply/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/seminar/apply/+page.server.ts";
export const imports = ["_app/immutable/nodes/9.C0K3cM5m.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/B5cnx04j.js","_app/immutable/chunks/BJxTeaXq.js","_app/immutable/chunks/Bj63PGj9.js","_app/immutable/chunks/DWPjaIqu.js","_app/immutable/chunks/U5XgkQ5N.js","_app/immutable/chunks/C_bhV80f.js","_app/immutable/chunks/BhxLg99C.js","_app/immutable/chunks/BkpQ8gsr.js","_app/immutable/chunks/gviOWbYU.js","_app/immutable/chunks/BquhoHsf.js","_app/immutable/chunks/B4HH5KP-.js","_app/immutable/chunks/_rr3zna6.js"];
export const stylesheets = ["_app/immutable/assets/9.C6eTe3e4.css"];
export const fonts = [];
