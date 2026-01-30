import { a as attr } from "../../../../chunks/attributes.js";
import { e as escape_html } from "../../../../chunks/escaping.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data, form } = $$props;
    $$renderer2.push(`<div class="container svelte-laisu"><div class="card svelte-laisu"><h1 class="svelte-laisu">신청 정보 수정</h1> <p class="desc svelte-laisu">제출하신 가입 신청 정보를 수정할 수 있습니다.<br/> 수정 후에도 기존 신청 시점의 타임스탬프는 유지됩니다.</p> `);
    if (form?.error) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="error svelte-laisu">${escape_html(form.error)}</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (form?.success) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="success-box svelte-laisu"><h2 class="svelte-laisu">✅ 수정 완료</h2> <p>신청 정보가 성공적으로 수정되었습니다.</p> <a href="/" class="btn-home svelte-laisu">메인으로 가기</a></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<form method="POST"><input type="hidden" name="id"${attr("value", data.application?.id)}/> <div class="form-group svelte-laisu"><label for="email" class="svelte-laisu">이메일</label> <input type="text" id="email"${attr("value", data.user?.email)} disabled class="svelte-laisu"/> <span class="hint svelte-laisu">로그인된 계정입니다.</span></div> <div class="form-group svelte-laisu"><label for="name" class="svelte-laisu">이름 <span class="req svelte-laisu">*</span></label> <input type="text" id="name" name="name"${attr("value", data.application?.name || data.user?.name)} required placeholder="홍길동" class="svelte-laisu"/></div> <div class="form-group svelte-laisu"><label for="department" class="svelte-laisu">학과 <span class="req svelte-laisu">*</span></label> <input type="text" id="department" name="department"${attr("value", data.application?.department || "")} required placeholder="수리과학부" class="svelte-laisu"/></div> <div class="form-group svelte-laisu"><label for="phone" class="svelte-laisu">전화번호 <span class="req svelte-laisu">*</span></label> <input type="tel" id="phone" name="phone"${attr("value", data.application?.phone || "")} required placeholder="010-0000-0000" class="svelte-laisu"/></div> <div class="form-group svelte-laisu"><label for="background" class="svelte-laisu">배경지식</label> <textarea id="background" name="background" rows="4" placeholder="관심 분야나 관련 경험을 적어주세요." class="svelte-laisu">`);
      const $$body = escape_html(data.application?.background || "");
      if ($$body) {
        $$renderer2.push(`${$$body}`);
      }
      $$renderer2.push(`</textarea></div> <button type="submit" class="btn-submit svelte-laisu">수정하기</button> <a href="/" class="btn-cancel-link svelte-laisu">취소</a></form>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
