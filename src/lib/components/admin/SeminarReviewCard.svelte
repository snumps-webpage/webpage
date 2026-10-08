<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import { seminarOperationError } from "$lib/domain/admin-seminars";
  import type { AdminSeminarRequestItem } from "$lib/domain/admin-seminars";

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
  let processing = $state<"approve" | "reject" | null>(null);

  function actionEnhancer(operation: "approve" | "reject"): SubmitFunction {
    return () => {
      processing = operation;

      return async ({ result, update }) => {
        try {
          if (result.type === "redirect") {
            await update({ reset: false });
            processing = null;
            return;
          }

          if (result.type === "success") {
            // The verdict lands on /admin — reload this page's board data.
            await update({ reset: false });
            const payload = result.data as { mailFailed?: boolean } | undefined;
            onTransition(
              operation === "approve" ? "approved" : "rejected",
              request.id,
              Boolean(payload?.mailFailed),
            );
            processing = null;
            return;
          }

          processing = null;
          onError(
            seminarOperationError(
              (result as { data?: { error?: string } }).data?.error,
              operation === "approve" ? "세미나 승인" : "신청 반려",
            ),
          );
        } catch {
          onError(
            "처리 결과를 새로 불러오지 못했습니다. 새로고침해 현재 상태를 확인해 주세요.",
          );
        } finally {
          processing = null;
        }
      };
    };
  }
</script>

<article class="review-card">
  <header class="card-heading">
    <div>
      <p class="eyebrow">신청 검토</p>
      <h3>{request.title}</h3>
    </div>
    <span class="kind-mark"
      >{request.kind === "regular"
        ? "정기"
        : request.kind === "irregular"
          ? "비정기"
          : "구분 미상"}</span
    >
  </header>

  <dl class="metadata">
    <div>
      <dt>신청자</dt>
      <dd>{request.requester.name} · {request.requester.department}</dd>
    </div>
    <div>
      <dt>발표자</dt>
      <dd>
        {request.presenters.map((presenter) => presenter.name).join(", ")}
      </dd>
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
    <summary>신청 내용과 자료</summary>
    <div class="proposal-copy">
      <p>{request.description}</p>
      <p><strong>선수 지식</strong> {request.prerequisites || "없음"}</p>
      {#if request.attachmentUrl}
        <a href={request.attachmentUrl} target="_blank" rel="noreferrer"
          >외부 자료 열기 ↗</a
        >
      {/if}
      {#if request.posterUrl}
        <div class="poster-preview">
          <strong>직접 업로드 포스터</strong>
          <a href={request.posterUrl} target="_blank" rel="noreferrer">
            <!--
              최적화를 태우지 않는다. 심사 중인 신청의 포스터는 **관리자 전용**이고
              (services/asset-access.ts), Vercel 이미지 최적화는 원본을 **쿠키 없이**
              서버에서 가져간다 — 그 요청은 세션이 없어 404를 받는다. 결과는 심사자가
              무엇을 승인하는지 못 보는 깨진 썸네일이다. 원본을 그대로 쓰면 브라우저가
              쿠키를 실어 보내므로 정상적으로 보인다.
            -->
            <img
              src={request.posterUrl}
              alt="{request.title} 포스터"
              loading="lazy"
              decoding="async"
            />
          </a>
        </div>
      {/if}
    </div>
  </details>

  <p class="mail-policy">
    승인 시 ‘일정 추후 안내’를 보내며, 확정 일정은 최초 공개할 때 다시
    안내합니다.
  </p>

  <div class="card-actions">
    {#if request.canApprove}
      <form
        method="POST"
        action="/admin?/approveSeminar"
        use:enhance={actionEnhancer("approve")}
      >
        <input type="hidden" name="id" value={request.id} />
        <button class="paper-btn primary" disabled={processing !== null}>
          {processing === "approve" ? "처리 중…" : "승인 · 일정 조율로"}
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
  .poster-preview {
    display: grid;
    gap: 0.4rem;
    margin-top: 0.6rem;
  }
  .poster-preview img {
    max-width: 220px;
    border: 1px solid var(--latex-rule);
  }
  .review-card {
    font-family: var(--font-ui);
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

  dt {
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
