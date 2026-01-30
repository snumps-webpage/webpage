import { x as attr_class } from "../../../chunks/index2.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import { a as attr } from "../../../chunks/attributes.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/state.svelte.js";
import { S as Skeleton } from "../../../chunks/Skeleton.js";
import { e as escape_html } from "../../../chunks/escaping.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    let applications = [];
    let seminarRequests = [];
    let attendanceQueue = [];
    let loadingApps = true;
    let loadingSeminars = true;
    let refreshingApps = false;
    let refreshingSeminars = false;
    $$renderer2.push(`<div class="admin-container svelte-1jef3w8"><header class="svelte-1jef3w8"><h1 class="svelte-1jef3w8">관리자 대시보드</h1> <div class="header-actions svelte-1jef3w8"><a href="/admin/events/new" class="admin-action-btn svelte-1jef3w8">📅 새 이벤트 만들기</a> <a href="/admin/events/connect" class="admin-action-btn secondary svelte-1jef3w8">🔗 기존 이벤트 연결</a> <a href="/signup" class="admin-action-btn signup svelte-1jef3w8">📝 회원 가입 페이지</a></div></header> <section class="events-section"><h2>이벤트 관리</h2> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="skeleton-list svelte-1jef3w8">`);
      Skeleton($$renderer2, { height: "3rem", className: "mb-2" });
      $$renderer2.push(`<!----> `);
      Skeleton($$renderer2, { height: "3rem", className: "mb-2" });
      $$renderer2.push(`<!----> `);
      Skeleton($$renderer2, { height: "3rem" });
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]--></section> <section class="mt-4 svelte-1jef3w8"><h2>출석 승인 대기 (${escape_html(attendanceQueue.length)})</h2> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="skeleton-list svelte-1jef3w8">`);
      Skeleton($$renderer2, { height: "3rem", className: "mb-2" });
      $$renderer2.push(`<!----> `);
      Skeleton($$renderer2, { height: "3rem" });
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]--></section> <dialog class="edit-dialog svelte-1jef3w8">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></dialog> <section class="mt-4 svelte-1jef3w8"><div class="section-header svelte-1jef3w8"><h2 class="svelte-1jef3w8">세미나 개설 신청 (${escape_html(seminarRequests.length)})</h2> <button class="refresh-btn svelte-1jef3w8"${attr("disabled", loadingSeminars, true)} aria-label="Refresh seminars"><span${attr_class("refresh-icon svelte-1jef3w8", void 0, { "spinning": refreshingSeminars })}>🔄</span></button></div> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="skeleton-list svelte-1jef3w8">`);
      Skeleton($$renderer2, { height: "3rem", className: "mb-2" });
      $$renderer2.push(`<!----> `);
      Skeleton($$renderer2, { height: "3rem", className: "mb-2" });
      $$renderer2.push(`<!----> `);
      Skeleton($$renderer2, { height: "3rem" });
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]--></section> <section class="mt-4 svelte-1jef3w8"><div class="section-header svelte-1jef3w8"><h2 class="svelte-1jef3w8">가입 승인 대기 (${escape_html(applications.length)})</h2> <button class="refresh-btn svelte-1jef3w8"${attr("disabled", loadingApps, true)} aria-label="Refresh applications"><span${attr_class("refresh-icon svelte-1jef3w8", void 0, { "spinning": refreshingApps })}>🔄</span></button></div> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="carousel-container skeleton-carousel svelte-1jef3w8"><div class="carousel-viewport svelte-1jef3w8"><div class="carousel-track svelte-1jef3w8"><div class="carousel-card-wrapper svelte-1jef3w8">`);
      Skeleton($$renderer2, { height: "350px", borderRadius: "12px" });
      $$renderer2.push(`<!----></div> <div class="carousel-card-wrapper svelte-1jef3w8">`);
      Skeleton($$renderer2, { height: "350px", borderRadius: "12px" });
      $$renderer2.push(`<!----></div> <div class="carousel-card-wrapper svelte-1jef3w8">`);
      Skeleton($$renderer2, { height: "350px", borderRadius: "12px" });
      $$renderer2.push(`<!----></div></div></div></div>`);
    }
    $$renderer2.push(`<!--]--></section></div>`);
  });
}
export {
  _page as default
};
