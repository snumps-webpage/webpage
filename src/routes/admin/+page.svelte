<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { onMount, untrack } from "svelte";
  import AdminApplicationQueue from "$lib/components/admin/AdminApplicationQueue.svelte";
  import AdminAttendanceQueue from "$lib/components/admin/AdminAttendanceQueue.svelte";
  import AdminEventLedger from "$lib/components/admin/AdminEventLedger.svelte";
  import AdminReviewInbox from "$lib/components/admin/AdminReviewInbox.svelte";
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import type {
    AdminAttendanceQueueItem,
    AdminDashboardData,
    AdminEventItem,
  } from "$lib/domain/admin-dashboard";
  import { MANUSCRIPT } from "$lib/constants";
  import { fetchAdminQueue } from "$lib/client/api";
  import { createAdminQueuePoller } from "$lib/client/admin-queue-poller";
  import type { AdminMembershipApplicationItem } from "$lib/domain/admin-dashboard";
  import type { AdminSeminarRequestItem } from "$lib/domain/admin-seminars";
  import type { AdminStudyRequestItem } from "$lib/domain/studies";

  let { data } = $props();
  let dashboard = $state<AdminDashboardData>(
    structuredClone(untrack(() => data.dashboard)),
  );
  let notice = $state<{ tone: "success" | "error"; message: string } | null>(null);
  let pollingError = $state<string | null>(null);

  async function refreshReviewQueues() {
    try {
      const [applications, seminars, studies] = await Promise.all([
        fetchAdminQueue<AdminMembershipApplicationItem>("/api/admin/applications"),
        fetchAdminQueue<AdminSeminarRequestItem>("/api/admin/seminar-requests"),
        fetchAdminQueue<AdminStudyRequestItem>("/api/admin/study-requests"),
      ]);
      dashboard.applications = applications.items;
      dashboard.seminarRequests = seminars.items;
      dashboard.studyRequests = studies.items;
      dashboard.generatedAt = [applications, seminars, studies]
        .map((response) => response.generatedAt)
        .sort()
        .at(-1) ?? dashboard.generatedAt;
      pollingError = null;
    } catch {
      pollingError = "신청 인박스를 새로고침하지 못했습니다. 직전 목록을 표시합니다.";
    }
  }

  onMount(() => {
    const poller = createAdminQueuePoller(refreshReviewQueues);
    poller.start();
    return () => poller.stop();
  });

  function showSuccess(message: string) { notice = { tone: "success", message }; }
  function showError(message: string) { notice = { tone: "error", message }; }

  function resolveApplication(applicationId: string, approved: boolean) {
    dashboard.applications = dashboard.applications.filter((item) => item.id !== applicationId);
    showSuccess(approved ? "가입 신청을 승인했습니다." : "가입 신청을 반려했습니다.");
    void refreshReviewQueues();
  }

  function transitionEvent(eventId: string, operation: "activated" | "expired" | "updated" | "deleted", event?: AdminEventItem) {
    if (operation === "deleted") dashboard.events = dashboard.events.filter((item) => item.id !== eventId);
    else if (event) dashboard.events = dashboard.events.map((item) => item.id === eventId ? event : item);
    showSuccess({ activated: "이벤트를 열었습니다.", expired: "이벤트를 종료했습니다.", updated: "이벤트를 수정했습니다.", deleted: "이벤트를 삭제했습니다." }[operation]);
  }

  function resolveAttendance(
    attendanceId: string,
    operation: "approved" | "rejected" | "updated" | "deleted",
    record?: AdminAttendanceQueueItem,
  ) {
    if (operation === "updated" && record) {
      dashboard.attendanceQueue = dashboard.attendanceQueue.map((item) => item.id === attendanceId ? record : item);
    } else {
      dashboard.attendanceQueue = dashboard.attendanceQueue.filter((item) => item.id !== attendanceId);
      dashboard.events = dashboard.events.map((event) => event.id === record?.eventId || dashboard.attendanceQueue.every((item) => item.eventId !== event.id)
        ? { ...event, pendingAttendanceCount: dashboard.attendanceQueue.filter((item) => item.eventId === event.id).length, canDelete: dashboard.attendanceQueue.every((item) => item.eventId !== event.id) }
        : event);
    }
    showSuccess({ approved: "출석을 승인해 활동 이력에 반영했습니다.", rejected: "출석 요청을 반려했습니다.", updated: "출석 시간을 수정했습니다.", deleted: "출석 기록을 삭제했습니다." }[operation]);
  }
</script>

<svelte:head><title>운영 대시보드 · SNUMPS 관리자</title></svelte:head>

<article class="paper-document admin-paper">
  <ManuscriptHeader title="운영 대시보드" subtitle="Operations Desk" figure={MANUSCRIPT.FIGURES.ADMIN} />

  <AdminSectionNav />

  <section class="desk-summary" aria-label="처리 현황">
    <div><span>가입 신청</span><strong>{dashboard.applications.length}</strong></div>
    <div><span>세미나 신청</span><strong>{dashboard.seminarRequests.length}</strong></div>
    <div><span>스터디 신청</span><strong>{dashboard.studyRequests.length}</strong></div>
    <div><span>출석 대기</span><strong>{dashboard.attendanceQueue.length}</strong></div>
    <div><span>탈퇴 유예</span><strong>{dashboard.withdrawals.length}</strong></div>
    <div><span>진행 이벤트</span><strong>{dashboard.events.filter((event) => event.status === "active").length}</strong></div>
  </section>

  {#if notice}
    <div class="notice" class:error={notice.tone === "error"} role="status">
      <span>{notice.message}</span>
      <button aria-label="알림 닫기" onclick={() => notice = null}>×</button>
    </div>
  {/if}

  <div class="dashboard-sections">
    <AdminApplicationQueue applications={dashboard.applications} onResolved={resolveApplication} onError={showError} />
    <AdminReviewInbox seminarRequests={dashboard.seminarRequests} studyRequests={dashboard.studyRequests} withdrawals={dashboard.withdrawals} />
    <AdminAttendanceQueue records={dashboard.attendanceQueue} onResolved={resolveAttendance} onError={showError} />
    <AdminEventLedger events={dashboard.events} onTransition={transitionEvent} onError={showError} />
  </div>

  {#if pollingError}<p class="polling-error" role="status">{pollingError}</p>{/if}

  <footer class="freshness">프리뷰 데이터 기준 {new Date(dashboard.generatedAt).toLocaleString("ko-KR")}</footer>
</article>

<style>
  .admin-paper { width: min(100%, 1160px); }
  .desk-summary { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); margin-bottom: 1rem; border: 1px solid var(--latex-rule); }
  .desk-summary div { display: grid; gap: 0.12rem; padding: 0.7rem; border-right: 1px solid var(--latex-rule); }
  .desk-summary div:last-child { border-right: 0; }
  .desk-summary span { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.56rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .desk-summary strong { font-family: var(--font-math); font-size: 1.45rem; font-weight: 500; }
  .notice { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; margin-bottom: 0.9rem; padding: 0.55rem 0.7rem; border-left: 3px solid var(--color-success-text); background: var(--color-success-bg); color: var(--color-success-text); font-size: 0.78rem; }
  .notice.error { border-color: var(--color-danger-text); background: var(--color-danger-bg); color: var(--color-danger-text); }
  .notice button { min-width: 2rem; min-height: 2rem; padding: 0; border: 0; background: transparent; color: currentColor; font-size: 1.2rem; }
  .dashboard-sections { display: grid; gap: 1.6rem; }
  .freshness { margin-top: 1.1rem; color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.56rem; font-weight: 700; text-align: right; text-transform: uppercase; }
  .polling-error { margin: 1rem 0 0; color: var(--color-danger-text); font-size: 0.72rem; }
  @media (max-width: 860px) { .desk-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); } .desk-summary div:nth-child(3n) { border-right: 0; } .desk-summary div:nth-child(-n + 3) { border-bottom: 1px solid var(--latex-rule); } }
  @media (max-width: 520px) { .desk-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } .desk-summary div { border-right: 1px solid var(--latex-rule); border-bottom: 1px solid var(--latex-rule); } .desk-summary div:nth-child(2n) { border-right: 0; } .desk-summary div:nth-last-child(-n + 2) { border-bottom: 0; } }
</style>
