<script lang="ts">
  import { onMount, untrack } from "svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import AdminSeminarRecordEditor, {
    type SeminarRecordFormState,
  } from "$lib/components/admin/AdminSeminarRecordEditor.svelte";
  import SeminarPublicationCard from "$lib/components/admin/SeminarPublicationCard.svelte";
  import SeminarReviewCard from "$lib/components/admin/SeminarReviewCard.svelte";
  import SeminarScheduleDialog from "$lib/components/admin/SeminarScheduleDialog.svelte";
  import type {
    AdminSeminarItem,
    AdminSeminarOperationResult,
    AdminSeminarRequestItem,
  } from "$lib/domain/admin-seminars";
  import { MANUSCRIPT } from "$lib/constants";
  import { fetchAdminQueue } from "$lib/client/api";
  import { createAdminQueuePoller } from "$lib/client/admin-queue-poller";

  let { data, form } = $props();

  const initialDashboard = untrack(() => data.dashboard);
  let requests = $state<AdminSeminarRequestItem[]>([
    ...initialDashboard.requests,
  ]);
  let seminars = $state<AdminSeminarItem[]>([...initialDashboard.seminars]);
  let records = $state([...untrack(() => data.records)]);
  let selectedSeminar = $state<AdminSeminarItem | null>(null);
  let notice = $state<{ tone: "success" | "error"; message: string } | null>(
    null,
  );
  let pollingError = $state<string | null>(null);

  async function refreshRequests() {
    try {
      const response = await fetchAdminQueue<AdminSeminarRequestItem>(
        "/api/admin/seminar-requests",
      );
      requests = response.items;
      pollingError = null;
    } catch {
      pollingError =
        "세미나 신청 큐를 새로고침하지 못했습니다. 직전 목록을 표시합니다.";
    }
  }

  onMount(() => {
    const poller = createAdminQueuePoller(refreshRequests);
    poller.start();
    return () => poller.stop();
  });

  function showError(message: string) {
    notice = { tone: "error", message };
  }

  function handleTransition(result: AdminSeminarOperationResult) {
    switch (result.operation) {
      case "approved":
        requests = requests.filter((item) => item.id !== result.requestId);
        seminars = [result.seminar, ...seminars];
        records = [
          result.record,
          ...records.filter((item) => item.id !== result.record.id),
        ];
        notice = {
          tone: result.mailFailed ? "error" : "success",
          message: result.mailFailed
            ? "세미나는 승인했지만 ‘일정 추후 안내’ 공지 발송에 실패했습니다."
            : "세미나를 승인하고 ‘일정 추후 안내’ 공지를 발송했습니다. 일정 공개·변경 시에도 안내 메일을 보냅니다.",
        };
        void refreshRequests();
        break;
      case "rejected":
        requests = requests.filter((item) => item.id !== result.requestId);
        notice = { tone: "success", message: "세미나 신청을 반려했습니다." };
        void refreshRequests();
        break;
      case "scheduled":
        seminars = seminars.map((item) => {
          if (item.id !== result.seminarId) return item;
          const alreadyPublished = item.publicationStatus === "published";
          return {
            ...item,
            schedule: result.schedule,
            publicationStatus: alreadyPublished ? "published" : "scheduled",
            canPublish: !alreadyPublished,
          };
        });
        selectedSeminar = null;
        notice = {
          tone: result.mailFailed ? "error" : "success",
          message:
            result.mailEvent === "schedule-changed"
              ? result.mailFailed
                ? "일정은 변경했지만 변경 안내 메일 발송에 실패했습니다."
                : "공개된 세미나 일정을 변경하고 안내 메일을 발송했습니다."
              : "일정을 저장했습니다. 확정 일정 안내는 세미나를 공개할 때 발송됩니다.",
        };
        break;
      case "published":
        seminars = seminars.map((item) =>
          item.id === result.seminarId
            ? {
                ...item,
                publicationStatus: "published",
                activityId: result.activityId,
                eventId: result.eventId,
                canPublish: false,
              }
            : item,
        );
        notice = {
          tone: result.mailFailed ? "error" : "success",
          message: result.mailFailed
            ? "세미나와 출석 이벤트는 공개했지만 확정 일정 안내 메일 발송에 실패했습니다."
            : "세미나와 출석 이벤트를 공개하고 확정 일정 안내 메일을 발송했습니다.",
        };
        break;
    }
  }
</script>

<svelte:head>
  <title>세미나 운영 · SNUMPS 관리자</title>
</svelte:head>

<article class="paper-document admin-seminar-paper">
  <ManuscriptHeader
    title="세미나 운영"
    subtitle="Review · Schedule · Publish"
    figure={MANUSCRIPT.FIGURES.ADMIN_SEMINARS}
  />
  <AdminSectionNav />

  <div class="page-toolbar">
    <p>승인과 일정 공개를 분리해, 지금 처리해야 할 다음 작업만 보여줍니다.</p>
    <a href="/admin" class="paper-btn secondary">전체 관리자 화면</a>
  </div>

  <section class="workflow-summary" aria-label="세미나 운영 현황">
    <div>
      <strong>{requests.length}</strong>
      <span>심사 대기</span>
    </div>
    <div>
      <strong
        >{seminars.filter((item) => item.publicationStatus === "unscheduled")
          .length}</strong
      >
      <span>일정 미정</span>
    </div>
    <div>
      <strong
        >{seminars.filter((item) => item.publicationStatus === "scheduled")
          .length}</strong
      >
      <span>공개 준비</span>
    </div>
    <div>
      <strong
        >{seminars.filter((item) => item.publicationStatus === "published")
          .length}</strong
      >
      <span>공개됨</span>
    </div>
  </section>

  {#if notice}
    <div class="notice" data-tone={notice.tone} role="status">
      <p>{notice.message}</p>
      <button aria-label="알림 닫기" onclick={() => (notice = null)}>×</button>
    </div>
  {/if}

  <section class="workflow-board" aria-label="세미나 작업함">
    <div class="workflow-column triage-column">
      <header class="column-heading">
        <div>
          <p>01 · Triage</p>
          <h2>심사 대기</h2>
        </div>
        <span>{requests.length}</span>
      </header>
      <p class="column-description">
        주제와 발표자를 검토하고 정기·비정기 구분을 확정합니다.
      </p>
      <div class="column-items">
        {#each requests as request (request.id)}
          <SeminarReviewCard
            {request}
            onTransition={handleTransition}
            onError={showError}
          />
        {:else}
          <p class="empty-state">심사할 신청이 없습니다.</p>
        {/each}
      </div>
    </div>

    <div class="workflow-column unscheduled-column">
      <header class="column-heading">
        <div>
          <p>02 · Coordinate</p>
          <h2>일정 미정</h2>
        </div>
        <span
          >{seminars.filter((item) => item.publicationStatus === "unscheduled")
            .length}</span
        >
      </header>
      <p class="column-description">
        승인된 발표자와 조율한 일시·장소를 입력합니다.
      </p>
      <div class="column-items">
        {#each seminars.filter((item) => item.publicationStatus === "unscheduled") as seminar (seminar.id)}
          <SeminarPublicationCard
            {seminar}
            onSchedule={(item) => (selectedSeminar = item)}
            onTransition={handleTransition}
            onError={showError}
          />
        {:else}
          <p class="empty-state">일정을 입력할 세미나가 없습니다.</p>
        {/each}
      </div>
    </div>

    <div class="workflow-column scheduled-column">
      <header class="column-heading">
        <div>
          <p>03 · Publish</p>
          <h2>공개 준비</h2>
        </div>
        <span
          >{seminars.filter((item) => item.publicationStatus === "scheduled")
            .length}</span
        >
      </header>
      <p class="column-description">
        일정을 최종 확인하고 활동·출석 이벤트를 엽니다.
      </p>
      <div class="column-items">
        {#each seminars.filter((item) => item.publicationStatus === "scheduled") as seminar (seminar.id)}
          <SeminarPublicationCard
            {seminar}
            onSchedule={(item) => (selectedSeminar = item)}
            onTransition={handleTransition}
            onError={showError}
          />
        {:else}
          <p class="empty-state">공개를 기다리는 세미나가 없습니다.</p>
        {/each}
      </div>
    </div>
  </section>

  <section class="published-section">
    <header>
      <div>
        <p>04 · Live Index</p>
        <h2>공개된 세미나</h2>
      </div>
      <span>공개 시 확정 일정 안내 · 공개 후 변경 시 변경 안내</span>
    </header>
    <div class="published-grid">
      {#each seminars.filter((item) => item.publicationStatus === "published") as seminar (seminar.id)}
        <SeminarPublicationCard
          {seminar}
          onSchedule={(item) => (selectedSeminar = item)}
          onTransition={handleTransition}
          onError={showError}
        />
      {:else}
        <p class="empty-state">공개된 세미나가 없습니다.</p>
      {/each}
    </div>
  </section>

  <AdminSeminarRecordEditor
    {records}
    members={data.members}
    currentTerm={data.currentTerm}
    form={form as SeminarRecordFormState | null}
  />

  {#if pollingError}
    <p class="polling-error" role="status">{pollingError}</p>
  {/if}

  <footer class="data-freshness">
    프리뷰 데이터 기준 시각 {new Date(
      initialDashboard.generatedAt,
    ).toLocaleString("ko-KR")}
  </footer>
</article>

{#if selectedSeminar}
  {#key selectedSeminar.id}
    <SeminarScheduleDialog
      seminar={selectedSeminar}
      onSaved={handleTransition}
      onClose={() => (selectedSeminar = null)}
    />
  {/key}
{/if}

<style>
  .admin-seminar-paper {
    width: min(100%, 1500px);
  }

  .page-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin: -0.5rem 0 1.2rem;
    padding: 0.85rem 0;
    border-bottom: 1px solid var(--latex-rule);
  }

  .page-toolbar p {
    max-width: 52rem;
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.87rem;
    line-height: 1.6;
  }

  .workflow-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-bottom: 1rem;
    border: 1px solid var(--latex-rule);
  }

  .workflow-summary div {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 0.55rem;
    padding: 0.7rem 0.85rem;
    border-right: 1px solid var(--latex-rule);
  }

  .workflow-summary div:last-child {
    border-right: 0;
  }

  .workflow-summary strong {
    font-family: var(--font-math);
    font-size: 1.45rem;
    font-weight: 500;
  }

  .workflow-summary span {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--latex-rule);
    border-left: 4px solid var(--latex-text);
  }

  .notice[data-tone="error"] {
    border-left-color: var(--latex-accent);
    color: var(--latex-accent);
  }

  .notice p {
    margin: 0;
    font-size: 0.82rem;
  }

  .notice button {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 1.1rem;
  }

  .workflow-board {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.8rem;
    align-items: start;
  }

  .workflow-column {
    min-width: 0;
    padding: 0.75rem;
    border: 1px solid var(--latex-rule);
    background: color-mix(in srgb, var(--latex-bg) 97%, var(--latex-text));
  }

  .column-heading,
  .published-section > header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 0.7rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--latex-rule);
  }

  .column-heading p,
  .published-section header p {
    margin: 0 0 0.2rem;
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .column-heading h2,
  .published-section h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.12rem;
    font-weight: 560;
  }

  .column-heading > span {
    width: 1.8rem;
    height: 1.8rem;
    border: 1px solid var(--latex-rule);
    display: grid;
    place-items: center;
    font-family: var(--font-math);
  }

  .column-description {
    min-height: 3.2rem;
    margin: 0.6rem 0;
    color: var(--latex-muted);
    font-size: 0.75rem;
    line-height: 1.5;
  }

  .column-items {
    display: grid;
    gap: 0.65rem;
  }

  .empty-state {
    margin: 0;
    padding: 1rem;
    border: 1px dashed var(--latex-rule);
    color: var(--latex-muted);
    font-size: 0.78rem;
    text-align: center;
  }

  .published-section {
    margin-top: 1.2rem;
    padding-top: 1rem;
    border-top: 2px solid var(--latex-rule);
  }

  .published-section header > span {
    max-width: 26rem;
    color: var(--latex-muted);
    font-size: 0.72rem;
    text-align: right;
  }

  .published-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
    margin-top: 0.75rem;
  }

  .data-freshness {
    margin-top: 1.2rem;
    padding-top: 0.65rem;
    border-top: 1px solid var(--latex-rule);
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    letter-spacing: 0.06em;
    text-align: right;
    text-transform: uppercase;
  }

  .polling-error {
    margin: 1rem 0 0;
    color: var(--color-danger-text);
    font-size: 0.72rem;
  }

  @media (max-width: 1120px) {
    .workflow-board {
      grid-template-columns: 1fr;
    }

    .column-description {
      min-height: 0;
    }

    .column-items {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    .page-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .workflow-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .workflow-summary div:nth-child(2) {
      border-right: 0;
    }

    .workflow-summary div:nth-child(-n + 2) {
      border-bottom: 1px solid var(--latex-rule);
    }

    .column-items,
    .published-grid {
      grid-template-columns: 1fr;
    }

    .published-section > header {
      align-items: start;
      flex-direction: column;
    }

    .published-section header > span {
      text-align: left;
    }
  }

  @media (max-width: 420px) {
    .workflow-summary {
      grid-template-columns: 1fr;
    }

    .workflow-summary div,
    .workflow-summary div:nth-child(2) {
      border-right: 0;
      border-bottom: 1px solid var(--latex-rule);
    }

    .workflow-summary div:last-child {
      border-bottom: 0;
    }
  }
</style>
