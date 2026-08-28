<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import type {
    DashboardActivityItem,
    DashboardOperationResult,
  } from "$lib/domain/dashboard";
  import { dashboardActivityState } from "$lib/domain/dashboard";

  let {
    initialActivities,
    semesters,
    selectedSemester,
  }: {
    initialActivities: DashboardActivityItem[];
    semesters: string[];
    selectedSemester: string;
  } = $props();

  let activities = $state([...untrack(() => initialActivities)]);
  let typeFilter = $state("all");
  let processingEventId = $state<string | null>(null);
  let notice = $state<{ tone: "success" | "error"; message: string } | null>(null);

  const activityTypes = $derived([...new Set(activities.map((item) => item.type))]);
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

  function stateLabel(activity: DashboardActivityItem) {
    return {
      available: "신청 가능",
      applied: "신청됨",
      pending: "출석 확인 대기",
      attended: "출석",
      absent: "미출석",
      scheduled: "예정",
    }[dashboardActivityState(activity)];
  }

  function switchSemester(semester: string) {
    const next = new URL(page.url);
    next.searchParams.set("semester", semester);
    goto(`${next.pathname}${next.search}`);
  }

  function activityEnhancer(eventId: string) {
    processingEventId = eventId;
    notice = null;
    return async ({ result }: { result: import("@sveltejs/kit").ActionResult }) => {
      processingEventId = null;
      if (result.type === "success") {
        const payload = result.data as DashboardOperationResult;
        if (payload.operation === "activityApplied" || payload.operation === "activityCancelled") {
          activities = activities.map((item) =>
            item.id === payload.activity.id ? payload.activity : item,
          );
          notice = {
            tone: "success",
            message:
              payload.operation === "activityApplied"
                ? "활동 참여를 신청했습니다."
                : "활동 참여 신청을 취소했습니다.",
          };
        }
        return;
      }
      const payload = result.type === "failure" ? result.data as { error?: string } : null;
      notice = {
        tone: "error",
        message:
          payload?.error === "EVENT_NOT_OPEN"
            ? "신청 가능한 시간이 지났습니다."
            : "참여 상태를 변경하지 못했습니다.",
      };
    };
  }
</script>

<section class="activity-ledger">
  <header>
    <div>
      <p>Activity Ledger</p>
      <h2>활동과 출석</h2>
    </div>
    <div class="ledger-controls">
      <label>
        <span>학기</span>
        <select value={selectedSemester} onchange={(event) => switchSemester(event.currentTarget.value)}>
          {#each semesters as semester (semester)}<option value={semester}>{semester}</option>{/each}
        </select>
      </label>
      <label>
        <span>종류</span>
        <select bind:value={typeFilter}>
          <option value="all">전체</option>
          {#each activityTypes as type (type)}<option value={type}>{type}</option>{/each}
        </select>
      </label>
    </div>
  </header>

  <div class="ledger-summary">
    <div><span>전체</span><strong>{activities.length}</strong></div>
    <div><span>출석 확정</span><strong>{attendedCount}</strong></div>
    <div><span>확인 대기</span><strong>{pendingCount}</strong></div>
  </div>

  {#if notice}
    <div class="notice" data-tone={notice.tone} role="status">
      <p>{notice.message}</p><button aria-label="알림 닫기" onclick={() => (notice = null)}>×</button>
    </div>
  {/if}

  <div class="activity-register" role="table" aria-label={`${selectedSemester} 활동 목록`}>
    <div class="table-header" role="row">
      <span role="columnheader">일시</span><span role="columnheader">활동</span><span role="columnheader">종류</span><span role="columnheader">상태</span><span role="columnheader">작업</span>
    </div>
    {#each filteredActivities as activity (activity.id)}
      {@const state = dashboardActivityState(activity)}
      <div class="activity-row" role="row" data-state={state}>
        <span class="activity-date" role="cell"><time datetime={activity.startsAt}>{formatDate(activity.startsAt)}</time></span>
        <div class="activity-title" role="cell">
          {#if activity.detailUrl}<a href={activity.detailUrl}>{activity.title}</a>{:else}<strong>{activity.title}</strong>{/if}
        </div>
        <span class="activity-type" role="cell">{activity.type}</span>
        <span class="activity-state" role="cell" data-state={state}>{stateLabel(activity)}</span>
        <div class="activity-action" role="cell">
          {#if activity.eventId && activity.canApply}
            <form method="POST" action={activity.isApplied ? "?/cancelActivity" : "?/applyActivity"} use:enhance={() => activityEnhancer(activity.eventId!)}>
              <input type="hidden" name="eventId" value={activity.eventId} />
              <button class="paper-btn small" class:primary={!activity.isApplied} disabled={processingEventId === activity.eventId}>
                {processingEventId === activity.eventId ? "처리 중…" : activity.isApplied ? "신청 취소" : "참여 신청"}
              </button>
            </form>
          {:else}
            <span>—</span>
          {/if}
        </div>
      </div>
    {:else}
      <p class="empty">조건에 맞는 활동이 없습니다.</p>
    {/each}
  </div>
</section>

<style>
  .activity-ledger { margin-top: 1rem; border: 1px solid var(--latex-rule); }
  header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; padding: 0.8rem; border-bottom: 2px solid var(--latex-rule); }
  header p, header h2, .notice p { margin: 0; }
  header p, label span, .ledger-summary span, .table-header, .activity-type, .activity-action > span { color: var(--latex-muted); font: 700 0.58rem/1.2 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; }
  header h2 { margin-top: 0.18rem; font-size: 1.08rem; font-weight: 560; }
  .ledger-controls { display: flex; gap: 0.5rem; }
  label { display: grid; gap: 0.2rem; }
  select { min-height: 2.15rem; border: 1px solid var(--latex-rule); background: var(--latex-bg); color: var(--latex-text); }
  .ledger-summary { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid var(--latex-rule); }
  .ledger-summary > div { display: flex; align-items: baseline; justify-content: space-between; padding: 0.55rem 0.8rem; border-right: 1px solid var(--latex-rule); }
  .ledger-summary > div:last-child { border-right: 0; }
  .ledger-summary strong { font: 700 1rem/1 var(--font-mono); }
  .notice { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.55rem 0.8rem; border-bottom: 1px solid var(--latex-rule); border-left: 4px solid var(--latex-text); font-size: 0.72rem; }
  .notice[data-tone="error"] { border-left-color: var(--color-danger-text); color: var(--color-danger-text); }
  .notice button { border: 0; background: transparent; color: inherit; cursor: pointer; }
  .table-header, .activity-row { display: grid; grid-template-columns: 10.5rem minmax(12rem, 1fr) 5.5rem 7.5rem 6.5rem; align-items: center; }
  .table-header { padding: 0.45rem 0.7rem; border-bottom: 1px solid var(--latex-rule); }
  .activity-row { min-height: 3.5rem; padding: 0.45rem 0.7rem; border-bottom: 1px solid color-mix(in srgb, var(--latex-rule) 58%, transparent); }
  .activity-row:last-child { border-bottom: 0; }
  .activity-date { color: var(--latex-muted); font: 0.67rem/1.35 var(--font-mono); }
  .activity-title strong, .activity-title a { font-size: 0.8rem; font-weight: 620; color: var(--latex-text); }
  .activity-title a { text-decoration: underline; text-underline-offset: 0.18em; }
  .activity-type { color: var(--latex-text); }
  .activity-state { justify-self: start; padding: 0.2rem 0.4rem; border: 1px solid var(--latex-rule); font: 700 0.58rem/1.2 var(--font-mono); white-space: nowrap; }
  .activity-state[data-state="attended"], .activity-state[data-state="applied"] { background: var(--latex-text); color: var(--latex-bg); }
  .activity-state[data-state="pending"] { border-style: dashed; }
  .activity-state[data-state="absent"] { color: var(--latex-accent); border-color: var(--latex-accent); }
  .activity-action { justify-self: end; }
  .empty { margin: 0; padding: 1.2rem; color: var(--latex-muted); text-align: center; font-size: 0.75rem; }
  @media (max-width: 760px) {
    header { align-items: stretch; flex-direction: column; }
    .ledger-controls { display: grid; grid-template-columns: 1fr 1fr; }
    .table-header { display: none; }
    .activity-row { grid-template-columns: 1fr auto; gap: 0.32rem 0.7rem; padding: 0.75rem; }
    .activity-date { grid-column: 1; grid-row: 1; }
    .activity-type { grid-column: 2; grid-row: 1; justify-self: end; }
    .activity-title { grid-column: 1 / -1; grid-row: 2; }
    .activity-state { grid-column: 1; grid-row: 3; }
    .activity-action { grid-column: 2; grid-row: 3; }
  }
  @media (max-width: 430px) {
    .ledger-summary > div { display: grid; gap: 0.2rem; }
    .activity-row { grid-template-columns: minmax(0, 1fr) auto; }
  }
</style>
