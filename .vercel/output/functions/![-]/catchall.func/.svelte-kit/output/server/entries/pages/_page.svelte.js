import { y as await_block, z as attr_style, F as stringify, G as ensure_array_like, x as attr_class } from "../../chunks/index3.js";
import { p as page } from "../../chunks/index4.js";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import { c as clsx, a as attr } from "../../chunks/attributes.js";
import "../../chunks/event.js";
import "../../chunks/state.svelte.js";
import { S as Skeleton } from "../../chunks/Skeleton.js";
import { e as escape_html } from "../../chunks/escaping.js";
function collapsibleCard($$renderer, title, bindValue, toggle, children) {
  $$renderer.push(`<section${attr_class(`card ${stringify("collapsed")}`, "svelte-1uha8ag")}><button type="button" class="card-header-toggle svelte-1uha8ag"${attr("aria-expanded", bindValue)}><h2 class="svelte-1uha8ag">${escape_html(title)}</h2> <span class="chevron svelte-1uha8ag" aria-hidden="true">${escape_html("▶")}</span></button> `);
  {
    $$renderer.push("<!--[!-->");
  }
  $$renderer.push(`<!--]--></section>`);
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    const session = page.data.session;
    const isAdmin = page.data.isAdmin;
    const isMember = data.isMember;
    let showProfile = false;
    let showSeminars = false;
    let selectedSemester = "all";
    $$renderer2.push(`<div class="container svelte-1uha8ag">`);
    if (session?.user) {
      $$renderer2.push("<!--[-->");
      if (isMember || isAdmin) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="dashboard-header svelte-1uha8ag"><h1 class="svelte-1uha8ag">SNUMPS 활동 현황</h1></div> `);
        await_block(
          $$renderer2,
          data.streamed.dashboard,
          () => {
            $$renderer2.push(`<div class="dashboard-skeleton"><div class="card mb-4 svelte-1uha8ag">`);
            Skeleton($$renderer2, { width: "100%", height: "150px" });
            $$renderer2.push(`<!----></div> <div class="card mb-4 svelte-1uha8ag">`);
            Skeleton($$renderer2, { width: "100%", height: "150px" });
            $$renderer2.push(`<!----></div> <div class="card mb-4 svelte-1uha8ag">`);
            Skeleton($$renderer2, { width: "100%", height: "150px" });
            $$renderer2.push(`<!----></div></div>`);
          },
          (result) => {
            if (result && "error" in result) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<div class="error-banner svelte-1uha8ag">${escape_html(result.error)}</div>`);
            } else {
              $$renderer2.push("<!--[!-->");
              if (result) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<div class="dashboard-grid svelte-1uha8ag">`);
                collapsibleCard($$renderer2, "회원 정보 관리", showProfile);
                $$renderer2.push(`<!---->  `);
                collapsibleCard($$renderer2, "세미나 관리", showSeminars);
                $$renderer2.push(`<!---->  <section class="stats-card svelte-1uha8ag"><h2 class="svelte-1uha8ag">${escape_html(data.semester)} 출석 현황</h2> <div class="stats-grid svelte-1uha8ag"><div class="stat-item svelte-1uha8ag"><span class="stat-value svelte-1uha8ag">${escape_html(result.myAttendanceStats.attended)}</span> <span class="stat-label svelte-1uha8ag">출석</span></div> <div class="stat-divider svelte-1uha8ag">/</div> <div class="stat-item svelte-1uha8ag"><span class="stat-value total svelte-1uha8ag">${escape_html(result.myAttendanceStats.total)}</span> <span class="stat-label svelte-1uha8ag">전체 활동</span></div> <div class="stat-chart svelte-1uha8ag">`);
                if (result.myAttendanceStats.total > 0) {
                  $$renderer2.push("<!--[-->");
                  $$renderer2.push(`<div class="pie-chart svelte-1uha8ag"${attr_style(`--percent: ${stringify(result.myAttendanceStats.attended / result.myAttendanceStats.total * 100)}%`)}></div>`);
                } else {
                  $$renderer2.push("<!--[!-->");
                }
                $$renderer2.push(`<!--]--></div></div></section></div> <section class="activities-list svelte-1uha8ag"><div class="list-header svelte-1uha8ag"><h3 class="svelte-1uha8ag">활동 목록</h3> `);
                $$renderer2.select(
                  { value: selectedSemester, class: "semester-select" },
                  ($$renderer3) => {
                    $$renderer3.option({ value: "all" }, ($$renderer4) => {
                      $$renderer4.push(`전체 활동`);
                    });
                    $$renderer3.push(`<!--[-->`);
                    const each_array_2 = ensure_array_like(result.semesters);
                    for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
                      let sem = each_array_2[$$index_2];
                      $$renderer3.option({ value: sem }, ($$renderer4) => {
                        $$renderer4.push(`${escape_html(sem)}학기`);
                      });
                    }
                    $$renderer3.push(`<!--]-->`);
                  },
                  "svelte-1uha8ag"
                );
                $$renderer2.push(`</div> `);
                if (result.activities.filter((a) => selectedSemester === "all").length === 0) {
                  $$renderer2.push("<!--[-->");
                  $$renderer2.push(`<p class="empty-state svelte-1uha8ag">활동 내역이 없습니다.</p>`);
                } else {
                  $$renderer2.push("<!--[!-->");
                  $$renderer2.push(`<div class="table-container svelte-1uha8ag"><table class="svelte-1uha8ag"><thead><tr><th class="svelte-1uha8ag">날짜</th><th class="svelte-1uha8ag">활동명</th><th class="svelte-1uha8ag">종류</th><th class="svelte-1uha8ag">출석</th></tr></thead><tbody><!--[-->`);
                  const each_array_3 = ensure_array_like(result.activities.filter((a) => selectedSemester === "all"));
                  for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
                    let activity = each_array_3[$$index_3];
                    $$renderer2.push(`<tr${attr_class(clsx(activity.attended ? "attended" : "absent"), "svelte-1uha8ag")}><td class="date svelte-1uha8ag">${escape_html(activity.date)}</td><td class="name svelte-1uha8ag"><a${attr("href", activity.url)} target="_blank" rel="noopener noreferrer" class="activity-link svelte-1uha8ag">${escape_html(activity.name)}</a></td><td class="svelte-1uha8ag"><span class="tag svelte-1uha8ag">${escape_html(activity.type)}</span></td><td class="status svelte-1uha8ag">`);
                    if (activity.attended) {
                      $$renderer2.push("<!--[-->");
                      $$renderer2.push(`<span class="badge success svelte-1uha8ag">출석</span>`);
                    } else {
                      $$renderer2.push("<!--[!-->");
                      $$renderer2.push(`<span class="badge fail svelte-1uha8ag">결석</span>`);
                    }
                    $$renderer2.push(`<!--]--></td></tr>`);
                  }
                  $$renderer2.push(`<!--]--></tbody></table></div>`);
                }
                $$renderer2.push(`<!--]--></section>`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]-->`);
            }
            $$renderer2.push(`<!--]-->`);
          }
        );
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="landing-hero svelte-1uha8ag"><h1 class="svelte-1uha8ag">SNUMPS Webpage</h1> <p class="subtitle svelte-1uha8ag">서울대학교 수학 문제 연구회</p> <div class="login-container svelte-1uha8ag"><button class="google-login-btn svelte-1uha8ag"><svg viewBox="0 0 24 24" width="24" height="24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"></path><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"></path><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"></path><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"></path></svg> <span>서울대학교 구글 계정으로 로그인</span></button> <p class="login-hint svelte-1uha8ag">@snu.ac.kr 계정만 이용 가능합니다.</p></div></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
