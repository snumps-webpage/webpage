<script lang="ts">
  import { enhance } from "$app/forms";
  import {
    orderStudyProposals,
    studyProposalDate,
    studyWithdrawalError,
    STUDY_PROPOSAL_STATUS,
    type StudyProposalRecord,
    type StudyProposalActionState,
  } from "$lib/domain/study-proposal";
  let {
    requests,
    canSubmit,
    form = null,
  }: {
    requests: StudyProposalRecord[];
    canSubmit: boolean;
    form?: StudyProposalActionState | null;
  } = $props();
  let withdrawingId = $state<string | null>(null);
  const ordered = $derived(orderStudyProposals(requests));
  const pendingCount = $derived(
    requests.filter((request) => request.status === "pending").length,
  );
  const withdrawalError = $derived(studyWithdrawalError(form));
</script>

<section
  id="my-study-requests"
  class="proposal-history"
  aria-labelledby="requests-heading"
>
  <header class="section-heading">
    <div>
      <p class="section-index">02 · 내 신청</p>
      <h2 id="requests-heading">검토와 개설 기록</h2>
    </div>
    <span class="request-count"
      >{pendingCount}건 검토 중 · 전체 {requests.length}건</span
    >
  </header>
  {#if form?.success && form.operation === "requestWithdrawn"}<p
      class="withdrawal-notice"
      role="status"
    >
      신청을 철회했습니다. 이 신청은 더 이상 검토되지 않습니다.
    </p>{/if}
  {#if withdrawalError}<p class="withdrawal-error" role="alert">
      {withdrawalError}
    </p>{/if}
  {#each ordered as request (request.id)}
    {@const status = STUDY_PROPOSAL_STATUS[request.status]}
    <article class="proposal-request" data-status={request.status}>
      <header class="request-heading">
        <h3>{request.title}</h3>
        <span class="request-status">{status.label}</span>
      </header>
      <p class="request-meta">
        {request.semester} · {studyProposalDate(request.submittedAt)} 제출
      </p>
      <p class="request-guidance">{status.description}</p>
      <details class="submitted-copy">
        <summary>제출한 내용</summary>
        <dl>
          <div>
            <dt>교재 또는 자료</dt>
            <dd>{request.textbook || "기록 없음"}</dd>
          </div>
          <div>
            <dt>진행 내용</dt>
            <dd class="submitted-description">
              {request.description || "기록 없음"}
            </dd>
          </div>
        </dl>
      </details>
      {#if request.status === "approved"}<a href="/study" class="approved-link"
          >스터디 목록에서 확인 →</a
        >{/if}
      {#if request.status === "pending"}
        <details class="withdraw-confirm">
          <summary>신청 철회</summary>
          <p>
            철회하면 운영진 검토가 중단됩니다. 다시 개설하려면 새 신청을
            제출해야 합니다.
          </p>
          <form
            method="POST"
            action="?/withdraw"
            aria-busy={withdrawingId === request.id}
            use:enhance={({ cancel }) => {
              if (withdrawingId || !canSubmit) {
                cancel();
                return;
              }
              withdrawingId = request.id;
              return async ({ update }) => {
                try {
                  await update({ reset: false });
                } finally {
                  withdrawingId = null;
                }
              };
            }}
          >
            <input type="hidden" name="id" value={request.id} />
            <button
              type="submit"
              class="paper-btn small"
              disabled={!!withdrawingId || !canSubmit}
              >{withdrawingId === request.id
                ? "철회 처리 중…"
                : "이 신청 철회"}</button
            >
          </form>
          <p class="confirm-hint">
            철회하지 않으려면 ‘신청 철회’를 다시 눌러 닫으세요.
          </p>
          {#if !canSubmit}<p class="confirm-hint">
              현재 계정은 열람만 가능합니다.
            </p>{/if}
        </details>
      {/if}
    </article>
  {:else}
    <div class="empty-history">
      <p>아직 제출한 신청이 없습니다</p>
      <span
        >개설 내용을 제출하면 이곳에서 접수 내용과 검토 상태를 확인할 수
        있습니다.</span
      >
    </div>
  {/each}
</section>

<style>
  .proposal-history {
    min-width: 0;
    scroll-margin-top: calc(var(--nav-height) + 1rem);
  }
  .section-heading {
    display: grid;
    gap: 0.5rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid var(--latex-text);
  }
  .section-index {
    margin: 0 0 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    color: var(--latex-muted);
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 550;
  }
  .request-count,
  .request-meta {
    margin: 0;
    color: var(--latex-muted);
    font-family: var(--font-ui);
    font-size: 0.74rem;
  }
  .proposal-request {
    padding: 1.15rem 0;
    border-bottom: 1px solid var(--latex-rule);
  }
  .request-heading {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
  }
  h3 {
    min-width: 0;
    margin: 0;
    font-size: 1rem;
    font-weight: 550;
    overflow-wrap: anywhere;
  }
  .request-status {
    flex-shrink: 0;
    color: var(--latex-muted);
    font-family: var(--font-ui);
    font-size: 0.74rem;
  }
  [data-status="pending"] .request-status {
    color: var(--latex-accent);
    font-weight: 600;
  }
  .request-meta {
    margin-top: 0.25rem;
  }
  .request-guidance {
    margin: 0.7rem 0;
    color: var(--latex-muted);
    font-size: 0.84rem;
    line-height: 1.65;
  }
  details {
    font-family: var(--font-ui);
    font-size: 0.8rem;
  }
  summary {
    min-height: 2.75rem;
    padding: 0.55rem 0;
    cursor: pointer;
    user-select: none;
  }
  summary:focus-visible {
    outline: 2px solid var(--latex-accent);
    outline-offset: 2px;
  }
  .submitted-copy dl {
    margin: 0.25rem 0 0.75rem;
    padding: 0.75rem;
    background: var(--latex-surface);
  }
  .submitted-copy dl > div + div {
    margin-top: 0.85rem;
  }
  dt {
    color: var(--latex-muted);
    font-size: 0.72rem;
  }
  dd {
    margin: 0.2rem 0 0;
    overflow-wrap: anywhere;
  }
  .submitted-description {
    white-space: pre-wrap;
  }
  .approved-link {
    display: inline-block;
    padding: 0.55rem 0;
    font-family: var(--font-ui);
    font-size: 0.8rem;
  }
  .withdraw-confirm {
    border-top: 1px solid var(--latex-rule);
  }
  .withdraw-confirm > p {
    margin: 0.3rem 0 0.7rem;
    color: var(--latex-muted);
  }
  .withdraw-confirm .confirm-hint {
    margin: 0.55rem 0;
    font-size: 0.72rem;
  }
  .withdraw-confirm button {
    padding-inline: 0.75rem;
  }
  .withdrawal-notice,
  .withdrawal-error {
    margin: 0.85rem 0 0;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--latex-rule);
    font-family: var(--font-ui);
    font-size: 0.82rem;
  }
  .withdrawal-error {
    color: var(--latex-accent);
  }
  .empty-history {
    padding: 1.25rem 0;
    border-bottom: 1px solid var(--latex-rule);
  }
  .empty-history p {
    margin: 0 0 0.45rem;
    font-size: 1rem;
  }
  .empty-history span {
    color: var(--latex-muted);
    font-size: 0.84rem;
  }
</style>
