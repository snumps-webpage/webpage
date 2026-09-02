<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import SeminarRequestForm from "$lib/components/seminar/SeminarRequestForm.svelte";
  import { MANUSCRIPT } from "$lib/constants";

  let { data, form } = $props();
</script>

<article class="paper-document seminar-request-paper">
  <ManuscriptHeader
    title="세미나 개설 신청"
    subtitle="Seminar Proposal · Schedule After Approval"
    figure={MANUSCRIPT.FIGURES.SEMINAR_APPLY}
  />

  <p class="proposal-intro">
    한 신청서는 한 번의 발표를 제안합니다. 주제와 발표자를 먼저 검토한 뒤,
    승인된 세미나의 일정은 운영진과 별도로 조율합니다.
  </p>

  <SeminarRequestForm
    mode="create"
    members={data.members}
    timingOptions={data.timingOptions}
    memberDirectoryUnavailable={data.memberDirectoryUnavailable}
    {form}
  />
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
</style>
