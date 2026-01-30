import { a as attr } from "../../../chunks/attributes.js";
import { e as escape_html } from "../../../chunks/escaping.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data, form } = $$props;
    $$renderer2.push(`<div class="container svelte-kmqcod"><div class="card svelte-kmqcod"><h1 class="svelte-kmqcod">회원가입 신청</h1> `);
    if (data.pending) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="status-box pending svelte-kmqcod"><h2 class="svelte-kmqcod">⏳ 가입 승인 대기중</h2> <p>가입 신청이 이미 접수되었습니다. 관리자 승인을 기다려주세요.</p> <div class="alert-actions mt-4 svelte-kmqcod"><a href="/wait" class="btn-home svelte-kmqcod">대기 페이지로 가기</a></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<p class="desc svelte-kmqcod">SNUMPS 활동을 위해 추가 정보가 필요합니다.<br/> 입력하신 정보는 동아리 운영 목적으로만 사용됩니다.</p> `);
      if (form?.error) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="error svelte-kmqcod">${escape_html(form.error)}</div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (form?.success) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="success-box svelte-kmqcod"><h2 class="svelte-kmqcod">✅ 신청 완료</h2> <p>가입 신청이 성공적으로 접수되었습니다. 관리자 승인 후 대시보드 이용이 가능합니다.</p> <a href="/" class="btn-home svelte-kmqcod">메인으로 가기</a></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<form method="POST"><div class="form-group svelte-kmqcod"><label for="email" class="svelte-kmqcod">이메일</label> <input type="text" id="email"${attr("value", data.user?.email)} disabled class="svelte-kmqcod"/> <span class="hint svelte-kmqcod">로그인된 계정입니다.</span></div> <div class="form-group svelte-kmqcod"><label for="name" class="svelte-kmqcod">이름 <span class="req svelte-kmqcod">*</span></label> <input type="text" id="name" name="name"${attr("value", data.user?.name)} required placeholder="홍길동" class="svelte-kmqcod"/></div> <div class="form-group svelte-kmqcod"><label for="department" class="svelte-kmqcod">학과 <span class="req svelte-kmqcod">*</span></label> <input type="text" id="department" name="department" required placeholder="수리과학부" class="svelte-kmqcod"/></div> <div class="form-group svelte-kmqcod"><label for="phone" class="svelte-kmqcod">전화번호 <span class="req svelte-kmqcod">*</span></label> <input type="tel" id="phone" name="phone" required placeholder="010-0000-0000" class="svelte-kmqcod"/></div> <div class="form-group svelte-kmqcod"><label for="background" class="svelte-kmqcod">배경지식</label> <textarea id="background" name="background" rows="4" placeholder="관심 분야나 관련 경험을 적어주세요." class="svelte-kmqcod"></textarea></div> <div class="agreement svelte-kmqcod"><label class="checkbox-container svelte-kmqcod"><input type="checkbox" name="agreement" required class="svelte-kmqcod"/> <span class="checkmark svelte-kmqcod"></span> 개인정보 수집 및 이용에 동의합니다. (필수)</label></div> <button type="submit" class="btn-submit svelte-kmqcod">가입 신청하기</button> <a href="/" class="btn-cancel-link svelte-kmqcod">취소</a></form>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
