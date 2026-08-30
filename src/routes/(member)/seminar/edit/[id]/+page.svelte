<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import SeminarRequestForm from "$lib/components/seminar/SeminarRequestForm.svelte";
  import { MANUSCRIPT } from "$lib/constants";

  let { data, form } = $props();
</script>

<article class="paper-document seminar-request-paper">
  <ManuscriptHeader
    title="세미나 신청 수정"
    subtitle="Seminar Proposal Revision · Pending Only"
    figure={MANUSCRIPT.FIGURES.SEMINAR_EDIT}
  />

  <p class="proposal-intro">
    승인 대기 중인 신청서만 수정할 수 있습니다. 저장한 내용 전체가 다음 관리자
    검토에 사용됩니다.
  </p>

  <SeminarRequestForm
    mode="edit"
    members={data.members}
    memberDirectoryUnavailable={data.memberDirectoryUnavailable}
    initialValues={{
      kind: data.request.kind,
      title: data.request.title,
      description: data.request.description,
      prerequisites: data.request.prerequisites,
      duration: data.request.duration,
      attachmentUrl: data.request.attachmentUrl,
      presenterIds: data.request.presenterIds,
    }}
    initialPresenters={data.request.initialPresenters}
    {form}
  />

  {#if !form?.success}
    <section class="withdraw-section" aria-labelledby="withdraw-heading">
      <div>
        <p>Proposal withdrawal</p>
        <h2 id="withdraw-heading">신청 철회</h2>
        <span>승인 대기 중인 신청만 철회할 수 있으며, 관리자 심사 목록에서 즉시 제거됩니다.</span>
      </div>
      <form method="POST" action="?/withdraw">
        <button
          class="paper-btn danger"
          onclick={(event) => {
            if (!confirm("이 세미나 신청을 철회하시겠습니까?"))
              event.preventDefault();
          }}>신청 철회</button
        >
      </form>
    </section>
  {/if}
</article>

<style>
  .seminar-request-paper {
    position: relative;
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
