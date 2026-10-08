<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import StudyRequestForm from "$lib/components/study/StudyRequestForm.svelte";
  import StudyProposalHistory from "$lib/components/study/StudyProposalHistory.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  let { data, form } = $props();
</script>

<svelte:head><title>스터디 개설 신청 · SNUMPS</title></svelte:head>

<article class="paper-document study-apply-paper">
  <nav class="proposal-back" aria-label="스터디 경로">
    <a href="/study">← 스터디 목록</a><a href="#my-study-requests"
      >내 신청 확인</a
    >
  </nav>
  <ManuscriptHeader
    title="스터디 개설 신청"
    subtitle="Study Proposal"
    figure={MANUSCRIPT.FIGURES.STUDY_APPLY}
  />
  <div class="proposal-intro">
    <p>
      함께 공부할 내용과 자료를 제안해 주세요. 운영진 승인 후 신청자가 주최자가
      되어 모집과 회차를 관리합니다.
    </p>
    <ol aria-label="스터디 개설 절차">
      <li><span>1</span>개설 내용 제출</li>
      <li><span>2</span>운영진 검토</li>
      <li><span>3</span>승인 후 모집</li>
    </ol>
  </div>
  <div class="apply-layout">
    <section class="proposal-sheet" aria-labelledby="proposal-heading">
      <header class="section-heading">
        <p>01 · 개설 내용</p>
        <h2 id="proposal-heading">새 신청서</h2>
      </header>
      <StudyRequestForm
        defaultSemester={data.defaultSemester}
        canSubmit={data.canSubmit}
        {form}
      />
    </section>
    <StudyProposalHistory
      requests={data.myRequests}
      canSubmit={data.canSubmit}
      {form}
    />
  </div>
</article>

<style>
  .study-apply-paper {
    width: min(100%, 70rem);
    padding: clamp(1rem, 3vw, 2rem);
  }
  .proposal-back {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
    font-family: var(--font-ui);
    font-size: 0.8rem;
  }
  .proposal-intro {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    align-items: start;
    gap: 2rem;
    margin-bottom: 2rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid var(--latex-rule);
  }
  .proposal-intro > p {
    max-width: 32rem;
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.92rem;
  }
  .proposal-intro ol {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
    list-style: none;
    margin: 0;
    padding: 0;
    font-family: var(--font-ui);
    font-size: 0.78rem;
  }
  .proposal-intro li {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
  }
  .proposal-intro li span {
    color: var(--latex-accent);
    font-family: var(--font-mono);
  }
  .apply-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(18rem, 0.85fr);
    gap: 2.5rem;
    align-items: start;
  }
  .proposal-sheet {
    min-width: 0;
  }
  .section-heading {
    margin-bottom: 1.3rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid var(--latex-text);
  }
  .section-heading p {
    margin: 0 0 0.3rem;
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.65rem;
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 550;
  }
  @media (max-width: 900px) {
    .proposal-intro,
    .apply-layout {
      grid-template-columns: 1fr;
    }
    .proposal-intro {
      gap: 1rem;
    }
    .apply-layout {
      gap: 2rem;
    }
  }
  @media (max-width: 620px) {
    .proposal-back {
      flex-wrap: wrap;
    }
  }
</style>
