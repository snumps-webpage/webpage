import * as server from '../entries/pages/seminar/apply/_page.server.ts.js';

export const index = 9;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/seminar/apply/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/seminar/apply/+page.server.ts";
export const imports = ["_app/immutable/nodes/9.DT4uW79H.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DgK-BC5G.js","_app/immutable/chunks/DqhKl33E.js","_app/immutable/chunks/D5HJUt-u.js","_app/immutable/chunks/BrURPvaF.js","_app/immutable/chunks/CWz7DQAJ.js","_app/immutable/chunks/CDEWUm48.js","_app/immutable/chunks/B0VApRkq.js","_app/immutable/chunks/q8Ta_Hl5.js","_app/immutable/chunks/C45_Yydf.js","_app/immutable/chunks/QEewnBXe.js","_app/immutable/chunks/CZBwn89t.js"];
export const stylesheets = ["_app/immutable/assets/9.C6eTe3e4.css"];
export const fonts = [];
