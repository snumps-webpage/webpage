import * as server from '../entries/pages/signup/_page.server.ts.js';

export const index = 10;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/signup/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/signup/+page.server.ts";
export const imports = ["_app/immutable/nodes/10.CtepIwAy.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DgK-BC5G.js","_app/immutable/chunks/DqhKl33E.js","_app/immutable/chunks/D5HJUt-u.js","_app/immutable/chunks/BrURPvaF.js","_app/immutable/chunks/QEewnBXe.js"];
export const stylesheets = ["_app/immutable/assets/10.BwFrMkiL.css"];
export const fonts = [];
