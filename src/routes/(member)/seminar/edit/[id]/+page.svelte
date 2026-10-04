<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import SeminarRequestForm from "$lib/components/seminar/SeminarRequestForm.svelte";
  import { actionErrorText } from "$lib/domain/api";
  import { enhance } from "$app/forms";
  import { MANUSCRIPT } from "$lib/constants";

  let { data, form } = $props();
  let withdrawing = $state(false);
</script>

<svelte:head><title>세미나 신청 수정 · SNUMPS</title></svelte:head>

<article class="paper-document seminar-request-paper">
  <ManuscriptHeader
    title="세미나 신청 수정"
    subtitle="Seminar Proposal Revision"
    figure={MANUSCRIPT.FIGURES.SEMINAR_EDIT}
  />

  <p class="proposal-intro">
    승인 대기 중인 신청서만 수정할 수 있습니다. 저장한 내용 전체가 다음 관리자
    검토에 사용됩니다.
  </p>

  <SeminarRequestForm
    mode="edit"
    members={data.members}
    timingOptions={data.timingOptions}
    memberDirectoryUnavailable={data.memberDirectoryUnavailable}
    initialValues={{
      title: data.request.title,
      description: data.request.description,
      prerequisites: data.request.prerequisites,
      duration: data.request.duration,
      attachmentUrl: data.request.attachment,
      presenterIds: data.request.speakerIds,
      preferredTiming: data.request.preferredTiming,
      kind: data.request.kind ?? "",
    }}
    initialPresenters={data.request.initialSpeakers}
    canSubmit={data.canSubmit}
    {form}
  />

  {#if !form?.success}
    <section class="withdraw-section" aria-labelledby="withdraw-heading">
      <div>
        <p>Proposal withdrawal</p>
        <h2 id="withdraw-heading">신청 철회</h2>
        <span
          >승인 대기 중인 신청만 철회할 수 있으며, 관리자 심사 목록에서 즉시
          제거됩니다.</span
        >
      </div>
      <details class="withdraw-confirm">
        <summary>철회 안내와 실행</summary>
        <p>
          철회하면 이 신청의 운영진 검토가 중단됩니다. 다시 제안하려면 새
          신청서를 제출해야 합니다.
        </p>
        {#if form?.operation === "requestWithdrawn" && form?.error}<p
            role="alert"
          >
            {actionErrorText(
              form,
              "신청을 철회하지 못했습니다. 최신 상태를 확인해 주세요.",
            )}
          </p>{/if}
        <form
          method="POST"
          action="?/withdraw"
          use:enhance={({ cancel }) => {
            if (withdrawing || !data.canSubmit) {
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
          <button
            type="submit"
            class="paper-btn"
            disabled={withdrawing || !data.canSubmit}
            >{withdrawing ? "철회 처리 중…" : "이 신청 철회"}</button
          >
        </form>
        <p>철회하지 않으려면 안내를 다시 눌러 닫으세요.</p>
      </details>
    </section>
  {/if}
</article>

<style>
  .seminar-request-paper {
    width: min(100%, 60rem);
  }
  .withdraw-confirm {
    min-width: 0;
  }
  .withdraw-confirm summary {
    min-height: 2.75rem;
    padding: 0.6rem 0;
    cursor: pointer;
    user-select: none;
  }
  .withdraw-confirm summary:focus-visible {
    outline: 2px solid var(--latex-accent);
    outline-offset: 2px;
  }
  .withdraw-confirm p {
    font-size: 0.82rem;
    color: var(--latex-muted);
  }

  .proposal-intro {
    max-width: 46rem;
    margin: -0.65rem 0 2rem;
    padding-left: 0.85rem;
    border-left: 3px solid var(--latex-accent);
    color: var(--latex-muted);
    font-size: 0.92rem;
    line-height: 1.7;
  }

  .withdraw-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 1.5rem;
    padding: 0.9rem;
    border: 1px solid var(--latex-rule);
    border-left: 3px solid var(--latex-accent);
  }

  .withdraw-section div {
    display: grid;
    gap: 0.22rem;
  }

  .withdraw-section p,
  .withdraw-section h2,
  .withdraw-section span {
    margin: 0;
  }

  .withdraw-section p {
    color: var(--latex-accent);
    font: 700 0.58rem/1.2 var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .withdraw-section h2 {
    font-size: 1rem;
  }

  .withdraw-section span {
    color: var(--latex-muted);
    font-size: 0.72rem;
    line-height: 1.55;
  }

  @media (max-width: 620px) {
    .withdraw-section {
      align-items: stretch;
      flex-direction: column;
    }

    .withdraw-section button {
      width: 100%;
    }
  }
</style>
