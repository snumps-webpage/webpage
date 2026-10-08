<script lang="ts">
  import { signOut } from "@auth/sveltekit/client";
  import { enhance } from "$app/forms";
  import { actionErrorText } from "$lib/domain/api";
  import { membershipSubmissionTime } from "$lib/domain/membership-onboarding";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  let { data, form } = $props();
  let withdrawing = $state(false);
</script>

<svelte:head><title>가입 승인 대기 · SNUMPS</title></svelte:head>
<article class="paper-document wait-paper">
  <ManuscriptHeader
    title="가입 승인 대기"
    subtitle="Membership Review"
    figure={MANUSCRIPT.FIGURES.WAIT}
  />
  {#if data.application}
    <section aria-labelledby="review-heading">
      <p class="status-label">접수 완료 · 검토 중</p>
      <h2 id="review-heading">운영진 검토를 기다리고 있습니다</h2>
      <p class="intro">
        아래 내용으로 신청이 접수되었습니다. 수정할 정보가 있다면 승인 전에 신청
        정보 수정 화면에서 저장해 주세요.
      </p>
      <dl class="application-summary">
        <div>
          <dt>이름</dt>
          <dd>{data.application.name}</dd>
        </div>
        <div>
          <dt>학과</dt>
          <dd>{data.application.department}</dd>
        </div>
        <div>
          <dt>이메일</dt>
          <dd>{data.application.email}</dd>
        </div>
        <div>
          <dt>학번</dt>
          <dd>{data.application.studentId || "미등록"}</dd>
        </div>
        <div>
          <dt>전화번호</dt>
          <dd>{data.application.phone}</dd>
        </div>
        <div>
          <dt>신청 시각 · 한국 시간</dt>
          <dd>{membershipSubmissionTime(data.application.submittedAt)}</dd>
        </div>
      </dl>
      <details class="application-background">
        <summary>저장된 배경지식 확인</summary>
        <p>{data.application.background || "작성한 배경지식이 없습니다."}</p>
      </details>
    </section>
    <div class="paper-actions">
      <a href="/signup/edit" class="paper-btn primary">신청 정보 수정</a><button
        type="button"
        class="paper-btn secondary"
        onclick={() => signOut()}>로그아웃</button
      >
    </div>
    <section
      id="withdraw-application"
      class="withdraw-section"
      aria-labelledby="withdraw-heading"
    >
      <h2 id="withdraw-heading">가입 신청 철회</h2>
      {#if form?.operation === "applicationWithdrawn" && form?.error}<p
          class="withdraw-error"
          role="alert"
        >
          신청을 철회하지 못했습니다. {actionErrorText(
            form,
            "잠시 후 다시 시도해 주세요.",
          )}
        </p>{/if}
      <details>
        <summary>철회·삭제 안내와 실행</summary>
        <p>
          철회하면 대기 중인 신청과 입력한 학번·연락처·배경지식이 삭제되며
          운영진 검토가 중단됩니다. 다시 신청하려면 새 신청서를 작성해야 합니다.
        </p>
        <form
          method="POST"
          action="?/withdrawApplication"
          aria-busy={withdrawing}
          use:enhance={({ cancel }) => {
            if (withdrawing) {
              cancel();
              return;
            }
            withdrawing = true;
            return async ({ update }) => {
              try {
                await update({ reset: false });
              } finally {
                withdrawing = false;
              }
            };
          }}
        >
          <input type="hidden" name="id" value={data.application.id} /><button
            type="submit"
            class="paper-btn"
            disabled={withdrawing}
            >{withdrawing ? "철회 처리 중…" : "내 가입 신청 철회·삭제"}</button
          >
        </form>
        <p class="confirm-hint">철회하지 않으려면 안내를 다시 눌러 닫으세요.</p>
      </details>
    </section>
  {:else}<p>확인할 대기 중 신청이 없습니다.</p>
    <a href="/signup" class="paper-btn">가입 신청 확인</a>{/if}
</article>

<style>
  .wait-paper {
    width: min(100%, 54rem);
  }
  .status-label {
    margin: 0;
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }
  h2 {
    margin: 0.4rem 0 0.9rem;
    font-size: 1.35rem;
    font-weight: 550;
  }
  .intro {
    color: var(--latex-muted);
    font-size: 0.9rem;
  }
  .application-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem 1.5rem;
    margin: 1.5rem 0;
  }
  .application-summary > div {
    min-width: 0;
    padding-bottom: 0.65rem;
    border-bottom: 1px solid var(--latex-rule);
  }
  dt {
    color: var(--latex-muted);
    font-family: var(--font-ui);
    font-size: 0.75rem;
  }
  dd {
    margin: 0.2rem 0 0;
    overflow-wrap: anywhere;
    font-size: 0.9rem;
  }
  summary {
    min-height: 2.75rem;
    padding: 0.6rem 0;
    cursor: pointer;
    user-select: none;
    font-family: var(--font-ui);
    font-size: 0.82rem;
  }
  summary:focus-visible {
    outline: 2px solid var(--latex-accent);
    outline-offset: 2px;
  }
  .application-background p {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 0.88rem;
  }
  .withdraw-section {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--latex-rule);
    scroll-margin-top: calc(var(--nav-height) + 1rem);
  }
  .withdraw-section p {
    font-size: 0.84rem;
    color: var(--latex-muted);
  }
  .withdraw-section .withdraw-error {
    color: var(--latex-accent);
  }
  .confirm-hint {
    font-size: 0.75rem !important;
  }
  @media (max-width: 620px) {
    .application-summary {
      grid-template-columns: 1fr;
    }
  }
</style>
