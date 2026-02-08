import { e as escape_html } from "../../../chunks/escaping.js";
import "clsx";
import "../../../chunks/event.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    $$renderer2.push(`<div class="wait-container svelte-mmvby"><div class="alert-box svelte-mmvby"><span class="icon svelte-mmvby">⌛</span> <h1 class="svelte-mmvby">가입 승인 대기 중</h1> <p class="msg svelte-mmvby">안녕하세요, ${escape_html(data.user?.name)}님!<br/> 회원 가입 신청이 정상적으로 접수되어 현재 관리자의 승인을 기다리고 있습니다.</p> <p class="hint svelte-mmvby">승인이 완료되면 SNUMPS 자동화 시스템의 모든 기능을 이용하실 수 있습니다.</p> <div class="alert-actions svelte-mmvby"><a href="/signup/edit" class="btn-edit svelte-mmvby">📝 신청 정보 수정하기</a> <button class="btn-logout svelte-mmvby">로그아웃</button></div></div></div>`);
  });
}
export {
  _page as default
};
