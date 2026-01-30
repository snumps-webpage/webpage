import * as server from '../entries/pages/_page.server.ts.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.ts";
export const imports = ["_app/immutable/nodes/3.C8rdJPuX.js","_app/immutable/chunks/DsnmJJEf.js","_app/immutable/chunks/DU_ekRCD.js","_app/immutable/chunks/DIudZohJ.js","_app/immutable/chunks/Dc_C0Rp-.js","_app/immutable/chunks/_k-4L2bP.js","_app/immutable/chunks/Di2yoJI-.js","_app/immutable/chunks/B3tms6QS.js","_app/immutable/chunks/Db7R9tDI.js","_app/immutable/chunks/DxaIkphV.js","_app/immutable/chunks/w45FNyLC.js","_app/immutable/chunks/DXvVQF7f.js","_app/immutable/chunks/ib5IoMGJ.js","_app/immutable/chunks/Bbjxasbd.js","_app/immutable/chunks/BzebbHOY.js","_app/immutable/chunks/Bz6cdGE2.js","_app/immutable/chunks/Bplx4Ser.js","_app/immutable/chunks/DR_ZOOQ5.js","_app/immutable/chunks/lNikU23B.js"];
export const stylesheets = ["_app/immutable/assets/Skeleton.Cj1A1n8x.css","_app/immutable/assets/3.Cvak83dK.css"];
export const fonts = [];
