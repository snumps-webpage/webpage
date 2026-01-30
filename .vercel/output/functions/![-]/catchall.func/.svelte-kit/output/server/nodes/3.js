import * as server from '../entries/pages/_page.server.ts.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.ts";
export const imports = ["_app/immutable/nodes/3.DSCibVDq.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/B5cnx04j.js","_app/immutable/chunks/BJxTeaXq.js","_app/immutable/chunks/gviOWbYU.js","_app/immutable/chunks/DWPjaIqu.js","_app/immutable/chunks/Bj63PGj9.js","_app/immutable/chunks/U5XgkQ5N.js","_app/immutable/chunks/C_bhV80f.js","_app/immutable/chunks/BhxLg99C.js","_app/immutable/chunks/BkpQ8gsr.js","_app/immutable/chunks/BquhoHsf.js","_app/immutable/chunks/B4HH5KP-.js","_app/immutable/chunks/BPlaetVe.js","_app/immutable/chunks/MsbqGx2f.js","_app/immutable/chunks/DGxvIe-_.js","_app/immutable/chunks/DVku1Xkc.js","_app/immutable/chunks/BxYDQ1xD.js","_app/immutable/chunks/D4RMClQu.js"];
export const stylesheets = ["_app/immutable/assets/Skeleton.Cj1A1n8x.css","_app/immutable/assets/3.Cvak83dK.css"];
export const fonts = [];
