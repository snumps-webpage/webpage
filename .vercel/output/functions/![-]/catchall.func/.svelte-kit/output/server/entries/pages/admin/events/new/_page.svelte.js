import { G as ensure_array_like } from "../../../../../chunks/index2.js";
import "@sveltejs/kit/internal";
import "../../../../../chunks/exports.js";
import "../../../../../chunks/utils.js";
import { e as escape_html } from "../../../../../chunks/escaping.js";
import "clsx";
import "@sveltejs/kit/internal/server";
import "../../../../../chunks/state.svelte.js";
import { D as DEFAULT_TIMEZONE, T as TIMEZONES } from "../../../../../chunks/constants.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    $$renderer2.push(`<div class="container svelte-33pcll"><h1 class="svelte-33pcll">새 이벤트 만들기</h1> <form method="POST"><div class="field svelte-33pcll"><label for="title" class="svelte-33pcll">이벤트 제목</label> <input type="text" id="title" name="title" required placeholder="예: 2025-1 개강총회" class="svelte-33pcll"/></div> <div class="field-row svelte-33pcll"><div class="field svelte-33pcll"><label for="date" class="svelte-33pcll">일시</label> <input type="datetime-local" id="date" name="date" required class="svelte-33pcll"/></div> <div class="field svelte-33pcll"><label for="timezone" class="svelte-33pcll">타임존</label> <select id="timezone" name="timezone" required class="svelte-33pcll"><!--[-->`);
    const each_array = ensure_array_like(TIMEZONES);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let tz = each_array[$$index];
      $$renderer2.option({ value: tz.value, selected: tz.value === DEFAULT_TIMEZONE }, ($$renderer3) => {
        $$renderer3.push(`${escape_html(tz.label)}`);
      });
    }
    $$renderer2.push(`<!--]--></select></div></div> <div class="field svelte-33pcll"><label for="type" class="svelte-33pcll">활동 종류</label> <select id="type" name="type" required class="svelte-33pcll"><!--[-->`);
    const each_array_1 = ensure_array_like(data.activityTypes);
    for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
      let type = each_array_1[$$index_1];
      $$renderer2.option({ value: type }, ($$renderer3) => {
        $$renderer3.push(`${escape_html(type)}`);
      });
    }
    $$renderer2.push(`<!--]--></select></div> <div class="actions svelte-33pcll"><a href="/admin" class="btn cancel svelte-33pcll">취소</a> <button class="btn submit svelte-33pcll">발행</button></div></form></div>`);
  });
}
export {
  _page as default
};
