import { G as ensure_array_like } from "../../../../chunks/index2.js";
import "@sveltejs/kit/internal";
import "../../../../chunks/exports.js";
import "../../../../chunks/utils.js";
import { a as attr } from "../../../../chunks/attributes.js";
import "@sveltejs/kit/internal/server";
import "../../../../chunks/state.svelte.js";
import { e as escape_html } from "../../../../chunks/escaping.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data, form } = $$props;
    let searchQuery = "";
    let selectedSpeakers = [];
    searchQuery.trim() === "" ? [] : data.members.filter((m) => !selectedSpeakers.find((s) => s.id === m.id) && (m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.department.toLowerCase().includes(searchQuery.toLowerCase()) || m.email.toLowerCase().includes(searchQuery.toLowerCase()))).slice(0, 5);
    $$renderer2.push(`<div class="container svelte-1qup0kb"><h1 class="svelte-1qup0kb">세미나 개설 신청</h1> `);
    if (form?.success) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="success-message svelte-1qup0kb"><h3>✅ 신청이 완료되었습니다!</h3> <p>관리자 검토 후 결과가 이메일로 전송됩니다.</p> <a href="/" class="btn home svelte-1qup0kb">홈으로 돌아가기</a></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<form method="POST">`);
      if (form?.error) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="error-banner svelte-1qup0kb">${escape_html(form.error)}</div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <div class="field svelte-1qup0kb"><label for="title" class="svelte-1qup0kb">세미나 주제 <span class="req svelte-1qup0kb">*</span></label> <input type="text" id="title" name="title" required placeholder="예: 대수위상 세미나" class="svelte-1qup0kb"/></div> <div class="field svelte-1qup0kb"><label for="description" class="svelte-1qup0kb">세미나 설명 <span class="req svelte-1qup0kb">*</span></label> <textarea id="description" name="description" rows="4" required placeholder="세미나의 목적과 내용을 간략히 적어주세요." class="svelte-1qup0kb"></textarea></div> <div class="field svelte-1qup0kb"><label for="prerequisites" class="svelte-1qup0kb">선수 지식</label> <textarea id="prerequisites" name="prerequisites" rows="2" placeholder="세미나를 듣기 위해 필요한 배경 지식이 있다면 적어주세요." class="svelte-1qup0kb"></textarea></div> <div class="field svelte-1qup0kb"><label for="duration" class="svelte-1qup0kb">예상 소요 시간 <span class="req svelte-1qup0kb">*</span></label> <input type="text" id="duration" name="duration" required placeholder="예: 90분" class="svelte-1qup0kb"/></div> <div class="field svelte-1qup0kb"><div class="label-row svelte-1qup0kb"><span class="label-text svelte-1qup0kb">발표자 (Speaker)</span> <button type="button" class="toggle-btn svelte-1qup0kb">${escape_html("DB에서 검색/추가")}</button></div> <div class="speaker-selection svelte-1qup0kb">`);
      if (selectedSpeakers.length > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="selected-list svelte-1qup0kb"><!--[-->`);
        const each_array = ensure_array_like(selectedSpeakers);
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let speaker = each_array[$$index];
          $$renderer2.push(`<div class="speaker-tag svelte-1qup0kb"><span class="name">${escape_html(speaker.name)}</span> <span class="info svelte-1qup0kb">${escape_html(speaker.department)}</span> <button type="button" class="remove-tag svelte-1qup0kb">✕</button></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<p class="hint svelte-1qup0kb">지정하지 않을 경우 신청자 본인이 발표자가 됩니다.</p>`);
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div> <input type="hidden" name="speakerIds"${attr("value", JSON.stringify(selectedSpeakers.map((s) => s.id)))} class="svelte-1qup0kb"/></div> <button class="btn submit svelte-1qup0kb">신청하기</button></form>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
