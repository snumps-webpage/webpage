<script lang="ts">
  import { enhance } from "$app/forms";
  import { untrack } from "svelte";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { AdminSeminarRequestItem } from "$lib/domain/admin-seminars";
  import type { SeminarKind } from "$lib/domain/seminars";

  interface Props {
    request: AdminSeminarRequestItem;
    onTransition: (
      operation: "approved" | "rejected",
      requestId: string,
      mailFailed: boolean,
    ) => void;
    onError: (message: string) => void;
  }

  let { request, onTransition, onError }: Props = $props();
  let selectedKind = $state<SeminarKind>(untrack(() => request.kind));
  let processing = $state<"approve" | "reject" | null>(null);

  function actionEnhancer(
    operation: "approve" | "reject",
  ): SubmitFunction {
    return () => {
      processing = operation;

      return async ({ result, update }) => {
        processing = null;

        if (result.type === "success") {
          // The verdict lands on /admin — reload this page's board data.
          await update({ reset: false });
          const payload = result.data as { mailFailed?: boolean } | undefined;
          onTransition(
            operation === "approve" ? "approved" : "rejected",
            request.id,
            Boolean(payload?.mailFailed),
          );
          return;
        }

        onError(
          operation === "approve"
            ? "세미나 승인을 처리하지 못했습니다."
            : "세미나 신청을 반려하지 못했습니다.",
        );
      };
    };
  }
</script>

<article class="review-card">
  <header class="card-heading">
    <div>
      <p class="eyebrow">Proposal · {request.id}</p>
      <h3>{request.title}</h3>
    </div>
    <span class="kind-mark">{request.kind === "regular" ? "R" : "I"}</span>
  </header>

  <dl class="metadata">
    <div>
      <dt>신청자</dt>
      <dd>{request.requester.name} · {request.requester.department}</dd>
    </div>
    <div>
      <dt>발표자</dt>
      <dd>{request.presenters.map((presenter) => presenter.name).join(", ")}</dd>
    </div>
    <div>
      <dt>예상 시간</dt>
      <dd>{request.duration}</dd>
    </div>
    <div>
      <dt>선호 시점</dt>
      <dd>{request.preferredTiming || "미선택"}</dd>
    </div>
    <div>
      <dt>신청일</dt>
      <dd>{new Date(request.createdAt).toLocaleDateString("ko-KR")}</dd>
    </div>
  </dl>

  <details>
    <summary>신청 원고 검토</summary>
    <div class="proposal-copy">
      <p>{request.description}</p>
      <p><strong>선수 지식</strong> {request.prerequisites || "없음"}</p>
      {#if request.attachmentUrl}
        <a href={request.attachmentUrl} target="_blank" rel="noreferrer">외부 자료 열기 ↗</a>
      {/if}
      {#if request.posterUrl}
        <div class="poster-preview">
          <strong>직접 업로드 포스터</strong>
          <a href={request.posterUrl} target="_blank" rel="noreferrer">
            <img src={request.posterUrl} alt="{request.title} 포스터" loading="lazy" />
          </a>
        </div>
      {/if}
    </div>
  </details>

  <div class="kind-correction">
    <span>승인 시 구분</span>
    <label class:active={selectedKind === "regular"}>
      <input type="radio" value="regular" bind:group={selectedKind} />
      정기
    </label>
    <label class:active={selectedKind === "irregular"}>
      <input type="radio" value="irregular" bind:group={selectedKind} />
      비정기
    </label>
  </div>

  <p class="mail-policy">
    승인 시 ‘일정 추후 안내’를 보내며, 확정 일정은 최초 공개할 때 다시 안내합니다.
  </p>

  <div class="card-actions">
    {#if request.canApprove}
      <form
        method="POST"
        action="/admin?/approveSeminar"
        use:enhance={actionEnhancer("approve")}
      >
        <input type="hidden" name="id" value={request.id} />
        <input type="hidden" name="kind" value={selectedKind} />
        <button class="paper-btn primary" disabled={processing !== null}>
          {processing === "approve" ? "처리 중…" : "승인 및 개설 공지"}
        </button>
      </form>
    {/if}
    {#if request.canReject}
      <form
        method="POST"
        action="/admin?/rejectSeminar"
        use:enhance={actionEnhancer("reject")}
      >
        <input type="hidden" name="id" value={request.id} />
        <button class="paper-btn danger" disabled={processing !== null}>
          {processing === "reject" ? "처리 중…" : "반려"}
        </button>
      </form>
    {/if}
  </div>
</article>

<style>
  .poster-preview { display: grid; gap: 0.4rem; margin-top: 0.6rem; }
  .poster-preview img { max-width: 220px; border: 1px solid var(--latex-rule); }
  .review-card {
    display: grid;
    gap: 0.85rem;
    padding: 1rem;
    border: 1px solid var(--latex-rule);
    border-top: 3px solid var(--latex-text);
    background: var(--latex-bg);
  }

  .card-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .eyebrow {
    margin: 0 0 0.25rem;
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h3 {
    margin: 0;
    color: var(--latex-text);
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: 560;
    line-height: 1.4;
  }

  .kind-mark {
    flex: 0 0 auto;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--latex-rule);
    display: grid;
    place-items: center;
    font-family: var(--font-math);
  }

  .metadata {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem 0.8rem;
    margin: 0;
  }

  .metadata div {
    min-width: 0;
  }

  dt,
  .kind-correction > span {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  dd {
    margin: 0.12rem 0 0;
    font-size: 0.84rem;
    line-height: 1.4;
  }

  details {
    border-top: 1px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
    padding: 0.65rem 0;
  }

  summary {
    cursor: pointer;
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .proposal-copy {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.65rem;
  }

  .proposal-copy p {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.84rem;
    line-height: 1.6;
  }

  .proposal-copy strong {
    margin-right: 0.35rem;
    color: var(--latex-text);
  }

  .proposal-copy a {
    width: fit-content;
    color: var(--latex-accent);
    font-size: 0.78rem;
  }

  .kind-correction {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .kind-correction > span {
    margin-right: auto;
  }

  .kind-correction label {
    position: relative;
    padding: 0.35rem 0.55rem;
    border: 1px solid var(--latex-rule);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.63rem;
  }

  .kind-correction label.active {
    border-color: var(--latex-text);
    background: var(--latex-text);
    color: var(--latex-bg);
  }

  .kind-correction input {
    position: absolute;
    inset: 0;
    opacity: 0;
  }

  .mail-policy {
    margin: 0;
    padding-left: 0.55rem;
    border-left: 2px solid var(--latex-accent);
    color: var(--latex-muted);
    font-size: 0.75rem;
    line-height: 1.5;
  }

  .card-actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .card-actions form {
    margin: 0;
  }

  .danger {
    border-color: var(--latex-accent);
    color: var(--latex-accent);
  }

  @media (max-width: 520px) {
    .metadata {
      grid-template-columns: 1fr;
    }

    .card-actions,
    .card-actions form,
    .card-actions :global(button) {
      width: 100%;
    }
  }
</style>
