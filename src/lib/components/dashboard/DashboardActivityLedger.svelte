<script lang="ts">
  import { enhance } from "$app/forms";
  import { beforeNavigate, goto } from "$app/navigation";
  import { navigating, page } from "$app/state";
  import { onDestroy, untrack } from "svelte";
  import { createAttendanceSubmissionGate } from "$lib/client/attendance-submission";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type {
    DashboardActivityAction,
    DashboardActivityItem,
    DashboardActivityNotice,
  } from "$lib/domain/dashboard";
  import {
    dashboardActivityActionPath,
    dashboardActivityErrorMessage,
    dashboardActivityNativeNotice,
    dashboardActivityState,
    dashboardActivityStateLabel,
    dashboardActivitySuccessMessage,
    mergeDashboardActivityResult,
  } from "$lib/domain/dashboard";

  let {
    initialActivities,
    semesters,
    selectedSemester,
    currentSemester,
    form = null,
  }: {
    initialActivities: DashboardActivityItem[];
    semesters: string[];
    selectedSemester: string;
    currentSemester?: string;
    form?: unknown;
  } = $props();

  const submissions = createAttendanceSubmissionGate();
  let sourceActivities = [...untrack(() => initialActivities)];
  let activities = $state([...sourceActivities]);
  let typeFilter = $state("all");
  let processingEventId = $state<string | null>(null);
  let switchingSemester = $state(false);
  let notice = $state<DashboardActivityNotice | null>(null);
  let dismissedForm = $state.raw<unknown>(null);
  const ledgerScope = $derived(
    `${page.url.pathname}${page.url.search}|${selectedSemester}`,
  );
  let syncedScope = $state(untrack(() => ledgerScope));

  const activityTypes = $derived([
    ...new Set(activities.map((item) => item.type)),
  ]);
  const filteredActivities = $derived(
    typeFilter === "all"
      ? activities
      : activities.filter((item) => item.type === typeFilter),
  );
  const attendedCount = $derived(
    activities.filter((item) => item.attended).length,
  );
  const pendingCount = $derived(
    activities.filter((item) => item.pendingAttendance).length,
  );
  const nativeAction = $derived.by((): DashboardActivityAction | null => {
    const apply = page.url.searchParams.has("/applyActivity");
    const cancel = page.url.searchParams.has("/cancelActivity");
    if (apply === cancel) return null;
    return apply ? "applyActivity" : "cancelActivity";
  });
  const nativeNotice = $derived(
    (page.url.searchParams.get("semester") ??
      currentSemester ??
      selectedSemester) === selectedSemester
      ? dashboardActivityNativeNotice(form, nativeAction, selectedSemester)
      : null,
  );
  const visibleNotice = $derived(
    notice ?? (dismissedForm === form ? null : nativeNotice),
  );
  const ledgerBusy = $derived(
    processingEventId !== null || switchingSemester || navigating.to !== null,
  );

  // A new load replaces the server snapshot. A parent re-filtering the same
  // row objects must not undo an authoritative apply/cancel response.
  $effect(() => {
    const incoming = initialActivities;
    const scope = ledgerScope;
    if (
      scope === syncedScope &&
      incoming.length === sourceActivities.length &&
      incoming.every((item, index) => item === sourceActivities[index])
    ) {
      return;
    }
    submissions.invalidate();
    sourceActivities = [...incoming];
    activities = [...incoming];
    syncedScope = scope;
    processingEventId = null;
    notice = null;
    dismissedForm = form;
    if (
      typeFilter !== "all" &&
      !incoming.some((item) => item.type === typeFilter)
    ) {
      typeFilter = "all";
    }
  });

  function abandonSubmission() {
    submissions.invalidate();
    processingEventId = null;
    notice = null;
    dismissedForm = form;
  }
  // Invalidate when navigation begins, not only after new data arrives. This
  // also prevents an older response from claiming the view after Back/Forward.
  beforeNavigate(abandonSubmission);
  onDestroy(() => submissions.invalidate());

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  async function switchSemester(event: Event) {
    const selector = event.currentTarget as HTMLSelectElement;
    if (selector.value === selectedSemester || switchingSemester) return;
    const next = new URL(page.url);
    next.searchParams.delete("/applyActivity");
    next.searchParams.delete("/cancelActivity");
    next.searchParams.set("semester", selector.value);
    abandonSubmission();
    switchingSemester = true;
    try {
      await goto(`${next.pathname}${next.search}`, { noScroll: true });
    } catch {
      selector.value = selectedSemester;
      notice = {
        tone: "error",
        message: "학기를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.",
      };
    } finally {
      switchingSemester = false;
    }
  }

  function activityEnhancer(
    eventId: string,
    action: DashboardActivityAction,
  ): SubmitFunction {
    return ({ formData, cancel }) => {
      const submittedEventId = String(formData.get("eventId") ?? "");
      const row = activities.find((item) => item.eventId === eventId);
      if (
        processingEventId !== null ||
        switchingSemester ||
        navigating.to !== null ||
        submittedEventId !== eventId ||
        !row?.canApply ||
        (row.isApplied ? "cancelActivity" : "applyActivity") !== action
      ) {
        cancel();
        return;
      }
      const semester = selectedSemester;
      const ticket = submissions.begin(ledgerScope);
      const ownsResponse = () => submissions.current(ticket, ledgerScope);
      processingEventId = eventId;
      notice = null;
      dismissedForm = form;
      return async ({ result, update }) => {
        try {
          if (!ownsResponse()) return;
          if (result.type === "redirect") {
            await update({ reset: false });
            return;
          }
          if (result.type === "success") {
            const merged = mergeDashboardActivityResult(
              activities,
              result.data,
              {
                eventId,
                semester,
                action,
              },
            );
            if (!merged) {
              notice = {
                tone: "error",
                message:
                  "처리 결과를 확인하지 못했습니다. 새로고침해 참여 상태를 확인해 주세요.",
              };
              return;
            }
            activities = merged;
            notice = {
              tone: "success",
              message: dashboardActivitySuccessMessage(action),
            };
            return;
          }
          const payload =
            result.type === "failure"
              ? (result.data as { error?: unknown })
              : null;
          const code =
            typeof payload?.error === "string"
              ? payload.error
              : result.type === "error"
                ? (
                    {
                      401: "UNAUTHORIZED",
                      403: "FORBIDDEN",
                      404: "NOT_FOUND",
                      503: "SERVICE_UNAVAILABLE",
                    } as Record<number, string>
                  )[result.status ?? 500]
                : undefined;
          notice = {
            tone: "error",
            message: dashboardActivityErrorMessage(code),
          };
        } catch {
          if (!ownsResponse()) return;
          notice = {
            tone: "error",
            message:
              "처리 결과를 확인하지 못했습니다. 새로고침해 참여 상태를 확인해 주세요.",
          };
        } finally {
          if (ownsResponse() && processingEventId === eventId) {
            processingEventId = null;
          }
        }
      };
    };
  }
</script>

<section
  class="activity-ledger"
  id="home-activities"
  aria-labelledby="activity-ledger-heading"
>
  <header class="ledger-heading">
    <div>
      <p class="section-number">§ 03 · 활동 기록</p>
      <h2 id="activity-ledger-heading">활동과 출석</h2>
      <p class="ledger-description">
        {#if currentSemester && selectedSemester !== currentSemester}
          지난 학기는 내가 출석한 활동만 표시합니다.
        {:else if currentSemester}
          이번 학기 회원에게 공개된 활동을 모두 표시합니다. 신청과 출석 기록을
          함께 확인하세요.
        {:else}
          이번 학기 공개 활동과 지난 학기 내가 출석한 기록을 학기별로
          확인하세요.
        {/if}
      </p>
    </div>
    <div class="ledger-controls">
      <label>
        <span>학기</span>
        <select
          value={selectedSemester}
          onchange={switchSemester}
          disabled={switchingSemester || navigating.to !== null}
        >
          {#each semesters as semester (semester)}
            <option value={semester}>{semester}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>활동 종류</span>
        <select
          bind:value={typeFilter}
          disabled={switchingSemester || navigating.to !== null}
        >
          <option value="all">전체</option>
          {#each activityTypes as type (type)}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </label>
    </div>
  </header>

  <dl class="ledger-summary" aria-label={`${selectedSemester} 목록 요약`}>
    <div>
      <dt>목록의 활동</dt>
      <dd>{activities.length}</dd>
    </div>
    <div>
      <dt>출석 기록 있음</dt>
      <dd>{attendedCount}</dd>
    </div>
    <div>
      <dt>출석 기록 확인</dt>
      <dd>{pendingCount}</dd>
    </div>
  </dl>

  {#if visibleNotice}
    <div
      class="notice"
      data-tone={visibleNotice.tone}
      role={visibleNotice.tone === "error" ? "alert" : "status"}
    >
      <p>{visibleNotice.message}</p>
      <button
        type="button"
        aria-label="활동 알림 닫기"
        onclick={() => {
          notice = null;
          dismissedForm = form;
        }}>×</button
      >
    </div>
  {/if}

  <p class="scroll-hint">작은 화면에서는 표를 가로로 넘겨 확인하세요.</p>
  <div class="register-scroll">
    <table aria-describedby="attendance-record-note">
      <caption>
        {selectedSemester} 활동 목록 · {filteredActivities.length}개{typeFilter !==
        "all"
          ? ` · ${typeFilter}`
          : ""}
      </caption>
      <thead>
        <tr
          ><th scope="col">일시 · KST</th><th scope="col">활동</th><th
            scope="col">종류</th
          ><th scope="col">참여·출석 기록</th><th scope="col">참여 신청</th></tr
        >
      </thead>
      <tbody>
        {#each filteredActivities as activity (activity.id)}
          {@const state = dashboardActivityState(activity)}
          {@const action = activity.isApplied
            ? "cancelActivity"
            : "applyActivity"}
          <tr data-state={state}>
            <td class="activity-date">
              <time datetime={activity.startsAt}
                >{formatDate(activity.startsAt)}</time
              >
            </td>
            <th class="activity-title" scope="row">
              {#if activity.detailUrl}
                <a href={activity.detailUrl}>{activity.title}</a>
              {:else}
                <span>{activity.title}</span>
              {/if}
            </th>
            <td class="activity-type">{activity.type}</td>
            <td>
              <span class="activity-state" data-state={state}
                >{dashboardActivityStateLabel(activity)}</span
              >
            </td>
            <td class="activity-action">
              {#if activity.eventId && activity.canApply}
                <form
                  method="POST"
                  action={dashboardActivityActionPath(action, selectedSemester)}
                  use:enhance={activityEnhancer(activity.eventId, action)}
                >
                  <input
                    type="hidden"
                    name="eventId"
                    value={activity.eventId}
                  />
                  <button
                    class="paper-btn"
                    class:primary={!activity.isApplied}
                    disabled={ledgerBusy}
                    aria-busy={processingEventId === activity.eventId}
                    aria-label={`${activity.title} ${activity.isApplied ? "신청 취소" : "참여 신청"}`}
                  >
                    {processingEventId === activity.eventId
                      ? "처리 중…"
                      : activity.isApplied
                        ? "신청 취소"
                        : "참여 신청"}
                  </button>
                </form>
              {:else}
                <span class="no-action" aria-label="신청 작업 없음">—</span>
              {/if}
            </td>
          </tr>
        {:else}
          <tr
            ><td class="empty" colspan="5">
              {typeFilter === "all"
                ? currentSemester && selectedSemester !== currentSemester
                  ? "이 학기에 기록된 내 출석 활동이 없습니다."
                  : "이 학기에 표시할 활동이 없습니다."
                : "선택한 종류에 맞는 활동이 없습니다."}
            </td></tr
          >
        {/each}
      </tbody>
    </table>
  </div>
  <p class="record-note" id="attendance-record-note">
    ‘출석 기록 확인’은 신청한 세미나가 시작됐지만 출석 기록이 없는 상태입니다.
    출석 요청·승인 여부는 이 목록에서 확인할 수 없습니다. ‘출석 기록 없음’은
    실제 불참을 뜻하지 않습니다.
  </p>
</section>

<style>
  .activity-ledger {
    margin-top: 2rem;
    border-top: 2px solid var(--latex-rule);
    font-family: var(--font-ui);
    scroll-margin-top: calc(var(--nav-height) + 1.25rem);
  }
  .ledger-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1.5rem;
    padding: 1.2rem 0;
  }
  .section-number {
    margin: 0 0 0.4rem;
    color: var(--latex-muted);
    font-size: 0.76rem;
    font-weight: 650;
    letter-spacing: 0.04em;
  }
  h2 {
    margin: 0;
    font: 550 clamp(1.4rem, 3vw, 1.75rem)/1.45 var(--font-display);
  }
  .ledger-description {
    max-width: 40rem;
    margin: 0.6rem 0 0;
    color: var(--latex-muted);
    font-size: 0.87rem;
    line-height: 1.75;
  }
  .ledger-controls {
    display: flex;
    flex-shrink: 0;
    gap: 0.75rem;
  }
  label {
    display: grid;
    gap: 0.4rem;
    color: var(--latex-muted);
    font-size: 0.78rem;
    font-weight: 600;
  }
  select {
    min-width: 7rem;
    min-height: 2.75rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--latex-rule);
    border-radius: 0;
    background: var(--latex-bg);
    color: var(--latex-text);
    font: 0.86rem/1.4 var(--font-ui);
  }
  select:focus-visible,
  button:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--latex-text);
    outline-offset: 3px;
  }
  .ledger-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem 2rem;
    margin: 0;
    padding: 0.85rem 0;
    border-block: 1px solid var(--latex-rule);
  }
  .ledger-summary > div {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }
  dt {
    color: var(--latex-muted);
    font-size: 0.8rem;
  }
  dd {
    margin: 0;
    font-size: 1rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 1rem;
    padding: 0.55rem 0 0.55rem 0.9rem;
    border-left: 2px solid var(--latex-text);
    font-size: 0.86rem;
    line-height: 1.65;
  }
  .notice p {
    margin: 0;
  }
  .notice[data-tone="error"] {
    border-left-color: var(--color-danger-text);
    color: var(--color-danger-text);
  }
  .notice button {
    flex-shrink: 0;
    min-width: 2.75rem;
    min-height: 2.75rem;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 1.3rem;
    cursor: pointer;
  }
  .register-scroll {
    width: 100%;
    overflow-x: auto;
  }
  table {
    width: 100%;
    min-width: 49rem;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.86rem;
    line-height: 1.65;
  }
  caption {
    padding: 1rem 0 0.65rem;
    color: var(--latex-muted);
    font-size: 0.78rem;
    text-align: left;
  }
  thead th {
    border-bottom: 1px solid var(--latex-text);
    color: var(--latex-muted);
    font-size: 0.76rem;
    font-weight: 600;
    white-space: nowrap;
  }
  th,
  td {
    padding: 0.8rem 0.65rem;
    vertical-align: middle;
  }
  th:first-child,
  td:first-child {
    padding-left: 0;
  }
  th:last-child,
  td:last-child {
    padding-right: 0;
  }
  tbody th,
  tbody td {
    border-bottom: 1px solid
      color-mix(in srgb, var(--latex-rule) 58%, transparent);
  }
  .activity-date {
    width: 11.5rem;
    color: var(--latex-muted);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .activity-title {
    min-width: 13rem;
    max-width: 28rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .activity-title a {
    color: var(--latex-text);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .activity-type {
    width: 5.5rem;
    color: var(--latex-muted);
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .activity-state {
    display: inline-block;
    padding: 0.12rem 0;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .activity-state[data-state="attended"],
  .activity-state[data-state="applied"] {
    font-weight: 650;
  }
  .activity-state[data-state="pending"] {
    text-decoration: underline dotted;
    text-underline-offset: 0.3em;
  }
  .activity-state[data-state="absent"],
  .activity-state[data-state="scheduled"] {
    color: var(--latex-muted);
  }
  .activity-action {
    width: 7.5rem;
    text-align: right;
  }
  .activity-action button {
    min-height: 2.75rem;
    padding: 0.45rem 0.65rem;
    font: 600 0.8rem/1.4 var(--font-ui);
    letter-spacing: 0;
    white-space: nowrap;
  }
  .no-action {
    display: block;
    padding-right: 2.8rem;
    color: var(--latex-muted);
  }
  .empty {
    padding-block: 2rem;
    color: var(--latex-muted);
    text-align: center;
  }
  .record-note,
  .scroll-hint {
    color: var(--latex-muted);
    font-size: 0.78rem;
    line-height: 1.8;
  }
  .record-note {
    margin: 0.85rem 0 0;
    max-width: 48rem;
  }
  .scroll-hint {
    display: none;
    margin: 0.85rem 0 0;
  }
  @media (max-width: 900px) {
    .ledger-heading {
      align-items: stretch;
      flex-direction: column;
      gap: 1rem;
    }
    .ledger-controls {
      display: grid;
      grid-template-columns: 1fr 1fr;
      width: min(100%, 28rem);
    }
    .scroll-hint {
      display: block;
    }
  }
  @media (max-width: 430px) {
    .ledger-summary {
      gap: 0.6rem 1.3rem;
    }
    .ledger-summary > div {
      flex-direction: column;
      gap: 0.25rem;
    }
  }
</style>
