import { e as escape_html } from "../../../../../chunks/escaping.js";
import "clsx";
import "@sveltejs/kit/internal";
import "../../../../../chunks/exports.js";
import "../../../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../../../chunks/state.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    $$renderer2.push(`<div class="container svelte-2mnv7b"><div class="card svelte-2mnv7b"><h1 class="svelte-2mnv7b">${escape_html(data.event.title)}</h1> <div class="meta svelte-2mnv7b"><span class="type svelte-2mnv7b">${escape_html(data.event.type)}</span> <span class="date">${escape_html(new Date(data.event.date).toLocaleString())}</span></div> <p class="user-info svelte-2mnv7b">참가자: <strong>${escape_html(data.user?.name)}</strong> (${escape_html(data.user?.email)})</p> <form method="POST" action="?/attend"><button class="btn attend svelte-2mnv7b">출석 체크 (Check In)</button></form></div></div>`);
  });
}
export {
  _page as default
};
