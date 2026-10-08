<script lang="ts">
  import { onMount } from "svelte";
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

  // Load data is the record authority; successful actions re-run it and this
  // writable derived resyncs (the poller may overwrite it in between).
  let requests: AdminSeminarRequestItem[] = $derived([
    ...data.dashboard.requests,
  ]);
  const seminars = $derived(data.dashboard.seminars);
  const records = $derived(data.records);
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

  /**
   * 카드가 돌려주는 결과를 문장으로 옮긴다. 예전에는 네 곳 모두 결과를 버려서
   * 일정 확정·공개·취소 어느 것도 "됐다"는 말을 남기지 않았다 — 카드가 다른
   * 칸으로 옮겨 가는 것이 유일한 신호였다.
   */
  function handleSeminarTransition(result: AdminSeminarOperationResult) {
    if (result.operation === "scheduled") {
      notice = {
        tone: "success",
        message: result.mailFailed
          ? "일정을 저장했지만 변경 공지 발송에 실패했습니다. 같은 값으로 다시 저장해도 재발송되지 않으니, 회원에게 직접 알려 주세요."
          : "일정을 저장했습니다. 공개 전 세미나는 공개 준비 단계로, 공개된 세미나는 변경된 일정으로 표시됩니다.",
      };
    } else if (result.operation === "published") {
      notice = {
        tone: "success",
        message: result.mailFailed
          ? "세미나를 공개했습니다. 다만 공지 발송에 실패했습니다. 카드에 공지 재발송이 표시되면 다시 시도하고, 표시되지 않으면 누락된 회원에게 별도로 알려 주세요."
          : "세미나를 공개했습니다. 회원 화면과 공개 아카이브에서 확인할 수 있습니다.",
      };
    } else if (result.operation === "cancelled") {
      notice = {
        tone: "success",
        message: result.mailFailed
          ? "세미나를 취소했습니다. 다만 취소 공지 발송에 실패했습니다 — 회원에게는 별도로 알려 주세요."
          : "세미나를 취소했습니다. 회원·공개 화면에서는 사라지고 관리자 화면에만 남습니다.",
      };
    }
  }

  // Approval creates an unscheduled seminar; activity/event creation waits for publication.
  function handleTransition(
    operation: "approved" | "rejected",
    requestId: string,
    mailFailed: boolean,
  ) {
    requests = requests.filter((item) => item.id !== requestId);
    // #16 / LB14-1: the verdict's notice to the presenter can fail; the
    // verdict itself stands.
    if (mailFailed) {
      notice = {
        tone: "success",
        message:
          operation === "approved"
            ? "세미나를 승인했지만 알림 메일은 보내지 못했습니다. 발표자에게 직접 알려 주세요."
            : "세미나 신청을 반려했지만 알림 메일은 보내지 못했습니다. 발표자에게 직접 알려 주세요.",
      };
    } else if (operation === "approved") {
      notice = {
        tone: "success",
        message:
          "세미나를 승인했습니다. 발표자와 일정을 조율한 뒤 공개해 주세요.",
      };
    } else {
      notice = { tone: "success", message: "세미나 신청을 반려했습니다." };
    }
    void refreshRequests();
  }
</script>

<svelte:head>
  <title>세미나 운영 · SNUMPS 관리자</title>
</svelte:head>

<article class="paper-document admin-seminar-paper">
  <ManuscriptHeader
    title="세미나 운영"
    subtitle="승인 → 일정 조율 → 공개"
    figure={MANUSCRIPT.FIGURES.ADMIN_SEMINARS}
  />
  <AdminSectionNav />

  <div class="page-toolbar">
    <p>승인과 일정 공개를 분리해, 지금 처리해야 할 다음 작업만 보여줍니다.</p>
    <a href="/admin" class="paper-btn secondary">전체 관리자 화면</a>
  </div>

  <section class="workflow-summary" aria-label="세미나 운영 현황">
    <a href="#seminar-review">
      <strong>{requests.length}</strong>
      <span>심사 대기</span>
    </a>
    <a href="#seminar-schedule">
      <strong
        >{seminars.filter((item) => item.publicationStatus === "unscheduled")
          .length}</strong
      >
      <span>일정 미정</span>
    </a>
    <a href="#seminar-publish">
      <strong
        >{seminars.filter((item) => item.publicationStatus === "scheduled")
          .length}</strong
      >
      <span>공개 준비</span>
    </a>
    <a href="#seminar-live">
      <strong
        >{seminars.filter((item) => item.publicationStatus === "published")
          .length}</strong
      >
      <span>공개됨</span>
    </a>
  </section>

  {#if notice}
    <div class="notice" data-tone={notice.tone} role="status">
      <p>{notice.message}</p>
      <button aria-label="알림 닫기" onclick={() => (notice = null)}>×</button>
    </div>
  {/if}

  <section class="workflow-board" aria-label="세미나 작업함">
    <section
      class="workflow-column triage-column"
      id="seminar-review"
      aria-labelledby="review-heading"
    >
      <header class="column-heading">
        <div>
          <p>§ 01 · 신청 검토</p>
          <h2 id="review-heading">심사 대기</h2>
        </div>
        <span>{requests.length}</span>
      </header>
      <p class="column-description">
        주제와 발표자를 검토합니다. 승인하면 일정 조율 단계로 옮겨집니다.
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
    </section>

    <section
      class="workflow-column unscheduled-column"
      id="seminar-schedule"
      aria-labelledby="schedule-heading"
    >
      <header class="column-heading">
        <div>
          <p>§ 02 · 승인 후 조율</p>
          <h2 id="schedule-heading">일정 입력</h2>
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
            onTransition={handleSeminarTransition}
            onError={showError}
          />
        {:else}
          <p class="empty-state">일정을 입력할 세미나가 없습니다.</p>
        {/each}
      </div>
    </section>

    <section
      class="workflow-column scheduled-column"
      id="seminar-publish"
      aria-labelledby="publish-heading"
    >
      <header class="column-heading">
        <div>
          <p>§ 03 · 최종 확인</p>
          <h2 id="publish-heading">공개 준비</h2>
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
            onTransition={handleSeminarTransition}
            onError={showError}
          />
        {:else}
          <p class="empty-state">공개를 기다리는 세미나가 없습니다.</p>
        {/each}
      </div>
    </section>
  </section>

  <section class="published-section" id="seminar-live">
    <header>
      <div>
        <p>§ 04 · 공개된 일정</p>
        <h2>공개된 세미나</h2>
      </div>
      <span>공개 시 확정 일정 안내 · 공개 후 변경 시 변경 안내</span>
    </header>
    <div class="published-grid">
      {#each seminars.filter((item) => item.publicationStatus === "published") as seminar (seminar.id)}
        <SeminarPublicationCard
          {seminar}
          onSchedule={(item) => (selectedSeminar = item)}
          onTransition={handleSeminarTransition}
          onError={showError}
        />
      {:else}
        <p class="empty-state">공개된 세미나가 없습니다.</p>
      {/each}
    </div>
  </section>

  {#if seminars.some((item) => item.publicationStatus === "cancelled")}
    <section class="published-section cancelled-section">
      <header>
        <div>
          <p>§ 05 · 취소 기록</p>
          <h2>취소된 세미나</h2>
        </div>
        <span>회원·공개 아카이브에서는 보이지 않습니다 · 출석 기록은 보존</span>
      </header>
      <div class="published-grid">
        {#each seminars.filter((item) => item.publicationStatus === "cancelled") as seminar (seminar.id)}
          <SeminarPublicationCard
            {seminar}
            onSchedule={(item) => (selectedSeminar = item)}
            onTransition={handleSeminarTransition}
            onError={showError}
          />
        {/each}
      </div>
    </section>
  {/if}

  <details class="record-tools" open={!!form}>
    <summary>세미나 기록 직접 작성·수정</summary>
    <AdminSeminarRecordEditor
      {records}
      members={data.members}
      currentTerm={data.currentTerm}
      form={form as SeminarRecordFormState | null}
    />
  </details>

  {#if pollingError}
    <p class="polling-error" role="status">{pollingError}</p>
  {/if}

  <footer class="data-freshness">
    데이터 기준 시각 {new Date(data.dashboard.generatedAt).toLocaleString(
      "ko-KR",
    )}
  </footer>
</article>

{#if selectedSeminar}
  {#key selectedSeminar.id}
    <SeminarScheduleDialog
      seminar={selectedSeminar}
      onSaved={(result) => {
        selectedSeminar = null;
        handleSeminarTransition(result);
      }}
      onClose={() => (selectedSeminar = null)}
    />
  {/key}
{/if}

<style>
  .admin-seminar-paper {
    width: min(100%, 1120px);
    font-family: var(--font-ui);
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

  .workflow-summary a {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    gap: 0.55rem;
    padding: 0.7rem 0.85rem;
    border-right: 1px solid var(--latex-rule);
    color: var(--latex-text);
    text-decoration: none;
    min-height: 3.25rem;
  }

  .workflow-summary a:last-child {
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
    grid-template-columns: 1fr;
    gap: 0.8rem;
    align-items: start;
  }

  .workflow-column {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(180px, 0.8fr) minmax(0, 2fr);
    gap: 0.5rem 1.5rem;
    padding: 1.25rem 0;
    border-top: 1px solid var(--latex-rule);
    scroll-margin-top: 1rem;
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
    grid-column: 2;
    grid-row: 1 / 3;
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

  .cancelled-section {
    margin-top: 1.6rem;
  }

  .published-grid {
    display: grid;
    grid-template-columns: 1fr;
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

  .record-tools {
    margin-top: 1.5rem;
    border-top: 1px solid var(--latex-rule);
  }
  .record-tools > summary {
    padding: 1rem 0;
    font: 550 1.1rem/1.5 var(--font-display);
    cursor: pointer;
  }
  .workflow-summary a:focus-visible {
    outline: 2px solid var(--latex-accent);
    outline-offset: -4px;
  }
  @media (max-width: 840px) {
    .workflow-board {
      grid-template-columns: 1fr;
    }

    .column-description {
      min-height: 0;
    }

    .workflow-column {
      grid-template-columns: 1fr;
    }
    .column-items {
      grid-column: auto;
      grid-row: auto;
      grid-template-columns: 1fr;
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

    .workflow-summary a:nth-child(2) {
      border-right: 0;
    }

    .workflow-summary a:nth-child(-n + 2) {
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

    .workflow-summary a,
    .workflow-summary a:nth-child(2) {
      border-right: 0;
      border-bottom: 1px solid var(--latex-rule);
    }

    .workflow-summary a:last-child {
      border-bottom: 0;
    }
  }
</style>
