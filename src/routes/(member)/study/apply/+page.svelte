<script lang="ts">
  import { enhance } from "$app/forms";
  import { untrack } from "svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import StudyRequestForm from "$lib/components/study/StudyRequestForm.svelte";
  import type {
    StudyOperationResult,
    StudyRequestItem,
  } from "$lib/domain/studies";
  import { MANUSCRIPT } from "$lib/constants";

  let { data } = $props();
  let requests = $state<StudyRequestItem[]>([
    ...untrack(() => data.requests),
  ]);
  let notice = $state<string | null>(null);
  let withdrawingId = $state<string | null>(null);

  function statusLabel(status: StudyRequestItem["status"]) {
    return {
      pending: "심사 중",
      approved: "승인",
      rejected: "반려",
      withdrawn: "철회",
    }[status];
  }

  function handleOperation(result: StudyOperationResult) {
    if (result.operation === "requestSubmitted") {
      requests = [result.request, ...requests];
      notice = "스터디 개설 신청을 제출했습니다.";
    }
    if (result.operation === "requestWithdrawn") {
      requests = requests.map((request) =>
        request.id === result.requestId
          ? { ...request, status: "withdrawn", canWithdraw: false }
          : request,
      );
      notice = "신청을 철회했습니다.";
    }
  }
</script>

<svelte:head><title>스터디 개설 신청 · SNUMPS</title></svelte:head>

<article class="paper-document study-apply-paper">
  <ManuscriptHeader
    title="스터디 개설 신청"
    subtitle="Study Group Proposal"
    figure={MANUSCRIPT.FIGURES.STUDY_APPLY}
  />

  {#if notice}
    <div class="notice" role="status">
      <p>{notice}</p>
      <button aria-label="알림 닫기" onclick={() => (notice = null)}>×</button>
    </div>
  {/if}

  <div class="apply-layout">
    <section class="proposal-sheet">
      <div class="section-heading">
        <p>01 · Proposal</p>
        <h2>개설 내용</h2>
      </div>
      <StudyRequestForm
        defaultSemester={data.defaultSemester}
        onSubmitted={handleOperation}
      />
    </section>

    <aside class="request-index">
      <div class="section-heading">
        <p>02 · My Requests</p>
        <h2>내 신청</h2>
      </div>
      <div class="request-list">
        {#each requests as request (request.id)}
          <article class="request-card" data-status={request.status}>
            <header>
              <strong>{request.title}</strong>
              <span>{statusLabel(request.status)}</span>
            </header>
            <p>{request.semester} · {new Date(request.createdAt).toLocaleDateString("ko-KR")}</p>
            {#if request.canWithdraw}
              <form
                method="POST"
                action="?/withdraw"
                use:enhance={() => {
                  withdrawingId = request.id;
                  return async ({ result }) => {
                    withdrawingId = null;
                    if (result.type === "success") {
                      handleOperation(result.data as StudyOperationResult);
                    }
                  };
                }}
              >
                <input type="hidden" name="requestId" value={request.id} />
                <button
                  class="paper-btn small"
                  disabled={withdrawingId === request.id}
                  onclick={(event) => {
                    if (!confirm("이 스터디 개설 신청을 철회하시겠습니까?")) {
                      event.preventDefault();
                    }
                  }}
                >신청 철회</button>
              </form>
            {/if}
          </article>
        {:else}
          <p class="empty-line">제출한 신청이 없습니다.</p>
        {/each}
      </div>
    </aside>
  </div>
</article>

<style>
  .study-apply-paper {
    width: min(100%, 1100px);
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

  .notice p {
    margin: 0;
    font-size: 0.8rem;
  }

  .notice button {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .apply-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(17rem, 0.6fr);
    gap: 0.9rem;
    align-items: start;
  }

  .proposal-sheet,
  .request-index {
    border: 1px solid var(--latex-rule);
  }

  .section-heading {
    padding: 0.75rem 0.9rem;
    border-bottom: 2px solid var(--latex-rule);
  }

  .section-heading p,
  h2 {
    margin: 0;
  }

  .section-heading p {
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    margin-top: 0.18rem;
    font-size: 1.15rem;
    font-weight: 560;
  }

  .proposal-sheet :global(form) {
    padding: 1rem;
  }

  .request-list {
    padding: 0.75rem;
  }

  .request-card {
    padding: 0.7rem;
    border: 1px solid var(--latex-rule);
  }

  .request-card + .request-card {
    margin-top: 0.5rem;
  }

  .request-card[data-status="pending"] {
    border-left: 3px solid var(--latex-accent);
  }

  .request-card header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .request-card strong {
    font-size: 0.82rem;
  }

  .request-card header span {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.56rem;
    font-weight: 700;
  }

  .request-card p {
    margin: 0.3rem 0 0;
    color: var(--latex-muted);
    font-size: 0.7rem;
  }

  .request-card form {
    margin-top: 0.55rem;
    text-align: right;
  }

  .empty-line {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.78rem;
  }

  @media (max-width: 820px) {
    .apply-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
