import { G as ensure_array_like, x as attr_class } from "../../../../../chunks/index3.js";
import "../../../../../chunks/exports.js";
import "../../../../../chunks/utils.js";
import { a as attr } from "../../../../../chunks/attributes.js";
import "../../../../../chunks/event.js";
import "../../../../../chunks/state.svelte.js";
import { e as escape_html } from "../../../../../chunks/escaping.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    let searchQuery = "";
    let selectedSemester = "all";
    let selectedEvent = null;
    let filteredActivities = data.activities.filter((a) => {
      const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase());
      let matchesSemester = true;
      return matchesSearch && matchesSemester;
    });
    $$renderer2.push(`<div class="container svelte-a5ae65"><h1 class="svelte-a5ae65">기존 이벤트 연결하기</h1> <p class="desc svelte-a5ae65">Notion에 이미 등록된 활동을 선택하여 출석 페이지를 생성합니다.</p> <div class="filter-bar svelte-a5ae65"><div class="search-box svelte-a5ae65"><input type="text"${attr("value", searchQuery)} placeholder="이벤트 명 검색..." class="svelte-a5ae65"/></div> `);
    $$renderer2.select(
      { value: selectedSemester, class: "semester-select" },
      ($$renderer3) => {
        $$renderer3.option({ value: "all" }, ($$renderer4) => {
          $$renderer4.push(`전체 학기`);
        });
        $$renderer3.push(`<!--[-->`);
        const each_array = ensure_array_like(data.semesters);
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let sem = each_array[$$index];
          $$renderer3.option({ value: sem }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(sem)}학기`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      },
      "svelte-a5ae65"
    );
    $$renderer2.push(`</div> <div class="list-container svelte-a5ae65">`);
    if (filteredActivities.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="empty svelte-a5ae65">검색 결과가 없습니다.</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="event-grid svelte-a5ae65"><!--[-->`);
      const each_array_1 = ensure_array_like(filteredActivities);
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let activity = each_array_1[$$index_1];
        $$renderer2.push(`<button${attr_class("event-card svelte-a5ae65", void 0, { "selected": selectedEvent?.id === activity.id })}><span class="type-tag svelte-a5ae65">${escape_html(activity.type)}</span> <span class="event-name svelte-a5ae65">${escape_html(activity.name)}</span> <span class="event-date svelte-a5ae65">${escape_html(activity.date)}</span></button>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="footer-actions svelte-a5ae65"><a href="/admin" class="btn abort svelte-a5ae65">취소</a> <form method="POST" action="?/publish">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <button class="btn publish svelte-a5ae65"${attr("disabled", !selectedEvent, true)}>발행</button></form></div></div>`);
  });
}
export {
  _page as default
};
