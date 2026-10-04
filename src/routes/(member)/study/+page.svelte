<script lang="ts">
  import { enhance } from "$app/forms";
  import { STUDY_STATUS_LABELS, type StudyStatus } from "$lib/domain/studies";
  import { groupStudies } from "$lib/domain/study-navigation";

  let { data } = $props();
  const studies = $derived(data.studies);
  const transferOffers = $derived(data.transferOffers);
  const groups = $derived(groupStudies(studies));
  const joinable = $derived(groups.joinable);
  const mine = $derived(groups.mine);
  const other = $derived(groups.other);
  let notice = $state<{ tone: "success" | "error"; message: string } | null>(
    null,
  );
  let processingStudyId = $state<string | null>(null);

  function statusLabel(status: StudyStatus) {
    return STUDY_STATUS_LABELS[status];
  }
  function relationshipLabel(
    relationship: (typeof studies)[number]["myState"],
  ) {
    return {
      organizer: "주최자",
      participant: "참여 중",
      pending: "승인 대기",
      none: "미참여",
    }[relationship];
  }

  function transferEnhancer(studyId: string, accepted: boolean) {
    processingStudyId = studyId;
    return async ({
      result,
      update,
    }: {
      result: import("@sveltejs/kit").ActionResult;
      update: () => Promise<void>;
    }) => {
      processingStudyId = null;
      if (result.type === "redirect") {
        await update();
        return;
      }
      if (result.type === "success") {
        await update();
        notice = {
          tone: "success",
          message: accepted
            ? "주최자 역할을 수락했습니다. 이제 스터디를 관리할 수 있습니다."
            : "주최자 전달 제안을 거절했습니다.",
        };
        return;
      }
      const data =
        result.type === "failure"
          ? (result.data as { error?: string; message?: string })
          : null;
      notice = {
        tone: "error",
        message: data?.message ?? data?.error ?? "제안을 처리하지 못했습니다.",
      };
    };
  }
</script>

<svelte:head><title>스터디 찾기 · SNUMPS</title></svelte:head>

<article class="study-page">
  <nav class="breadcrumbs" aria-label="현재 위치">
    <a href="/">내 활동</a><span aria-hidden="true">/</span><span>스터디</span>
  </nav>
  <header class="page-heading">
    <div>
      <p class="kicker">함께 공부하기</p>
      <h1>스터디 찾기</h1>
      <p>
        내용과 운영 방식을 살펴보고, 참여하고 싶은 모임에 신청하세요. 주최자가
        신청을 확인합니다.
      </p>
    </div>
    {#if data.canParticipate}<a href="/study/apply" class="create-link"
        >새 스터디 제안</a
      >{/if}
  </header>

  {#if notice}<div class="notice" data-tone={notice.tone} role="status">
      <p>{notice.message}</p>
      <button aria-label="알림 닫기" onclick={() => (notice = null)}>×</button>
    </div>{/if}

  {#if !data.canParticipate}<p class="read-only-note">
      이번 학기 등록 전에는 스터디를 열람할 수 있습니다. 참여 신청과 주최자
      작업은 등록 후 이용하세요.
    </p>{/if}

  {#if transferOffers.length}
    <section class="transfer-inbox" aria-label="주최자 전달 제안">
      <h2>확인할 제안</h2>
      {#each transferOffers as offer (offer.studyId)}
        <div class="transfer-row">
          <div>
            <strong>{offer.studyTitle}의 주최자 전달</strong>
            <p>{offer.fromName} 님이 주최자 역할을 전달하려 합니다.</p>
          </div>
          <div class="offer-actions">
            <form
              method="POST"
              action="?/declineTransfer"
              use:enhance={() => transferEnhancer(offer.studyId, false)}
            >
              <input
                type="hidden"
                name="studyId"
                value={offer.studyId}
              /><button
                disabled={!data.canParticipate ||
                  processingStudyId === offer.studyId}>거절</button
              >
            </form>
            <form
              method="POST"
              action="?/acceptTransfer"
              use:enhance={() => transferEnhancer(offer.studyId, true)}
            >
              <input
                type="hidden"
                name="studyId"
                value={offer.studyId}
              /><button
                class="primary"
                disabled={!data.canParticipate ||
                  processingStudyId === offer.studyId}>수락</button
              >
            </form>
          </div>
        </div>
      {/each}
    </section>
  {/if}

  <nav class="section-nav" aria-label="스터디 목록 이동">
    <a href="#joinable">참여 가능 <span>{joinable.length}</span></a><a
      href="#mine">내 스터디 <span>{mine.length}</span></a
    ><a href="#other">기록·다른 스터디 <span>{other.length}</span></a>
  </nav>

  <section id="joinable" class="study-section">
    <div class="section-heading">
      <div>
        <h2>
          <span class="section-number" aria-hidden="true">§ 01</span>지금 참여할
          수 있어요
        </h2>
        <p>모집 중인 스터디를 먼저 보여 드립니다.</p>
      </div>
      <span>{joinable.length}개</span>
    </div>
    {#each joinable as study (study.id)}
      <article class="study-row">
        <div>
          <p class="row-meta">{study.semester} · 모집 중</p>
          <h3><a href={`/study/${study.id}`}>{study.title}</a></h3>
          <p class="description">{study.description}</p>
          <p class="details">
            주최 {study.organizerNames.join(", ")}
            <span aria-hidden="true">·</span>
            교재 {study.textbook}
          </p>
        </div>
        <a class="row-action" href={`/study/${study.id}`}
          >{data.canParticipate ? "내용 보고 신청" : "내용 보기"}
          <span aria-hidden="true">→</span></a
        >
      </article>
    {:else}<p class="empty">
        현재 모집 중인 스터디가 없습니다. 지난 기록을 둘러보거나 새 스터디를
        제안할 수 있습니다.
      </p>{/each}
  </section>

  <section id="mine" class="study-section">
    <div class="section-heading">
      <div>
        <h2>
          <span class="section-number" aria-hidden="true">§ 02</span>내 스터디
        </h2>
        <p>참여 상태와 주최자 작업을 확인하세요.</p>
      </div>
      <span>{mine.length}개</span>
    </div>
    {#each mine as study (study.id)}
      <article class="study-row">
        <div>
          <p class="row-meta">
            {study.semester} · {relationshipLabel(study.myState)} · {statusLabel(
              study.status,
            )}
          </p>
          <h3><a href={`/study/${study.id}`}>{study.title}</a></h3>
          <p class="description">{study.description}</p>
        </div>
        <a
          class="row-action"
          href={study.myState === "organizer"
            ? `/study/${study.id}/manage`
            : `/study/${study.id}`}
          >{study.myState === "organizer" ? "주최자 작업" : "참여 상태 보기"}
          <span aria-hidden="true">→</span></a
        >
      </article>
    {:else}<p class="empty">
        참여 중인 스터디가 없습니다. 위에서 모집 중인 스터디를 살펴보세요.
      </p>{/each}
  </section>

  <section id="other" class="study-section">
    <div class="section-heading">
      <div>
        <h2>
          <span class="section-number" aria-hidden="true">§ 03</span>지난 기록과
          다른 스터디
        </h2>
        <p>모집이 끝난 스터디도 내용을 볼 수 있습니다.</p>
      </div>
      <span>{other.length}개</span>
    </div>
    {#each other as study (study.id)}
      <article class="study-row">
        <div>
          <p class="row-meta">{study.semester} · {statusLabel(study.status)}</p>
          <h3><a href={`/study/${study.id}`}>{study.title}</a></h3>
          <p class="description">{study.description}</p>
        </div>
        <a class="row-action" href={`/study/${study.id}`}
          >기록 보기 <span aria-hidden="true">→</span></a
        >
      </article>
    {:else}<p class="empty">표시할 지난 기록이 없습니다.</p>{/each}
  </section>
  <p class="updated">
    데이터 기준 {new Date(data.generatedAt).toLocaleString("ko-KR")}
  </p>
</article>

<style>
  .read-only-note {
    margin: 1rem 0;
    padding: 1rem;
    border-left: 3px solid var(--latex-accent);
    color: var(--latex-muted);
    background: var(--latex-surface);
    font-size: 0.9rem;
    line-height: 1.6;
  }
  .section-number {
    display: inline-block;
    margin-right: 0.65rem;
    color: var(--latex-muted);
    font: 500 0.85rem/1.4 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .study-page {
    max-width: 1080px;
    margin: 0 auto;
    padding: 2.2rem 1.5rem 5rem;
    color: var(--latex-text);
    font-family:
      system-ui,
      -apple-system,
      "Apple SD Gothic Neo",
      sans-serif;
  }
  .breadcrumbs {
    display: flex;
    gap: 0.6rem;
    color: var(--latex-muted);
    font-size: 0.82rem;
  }
  .breadcrumbs a {
    color: inherit;
    text-underline-offset: 0.2em;
  }
  .page-heading {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 1.5rem;
    margin: 1.3rem 0 2rem;
  }
  .kicker,
  .row-meta {
    color: var(--latex-accent);
    font-size: 0.78rem;
    font-weight: 700;
  }
  h1,
  h2,
  h3,
  p {
    margin: 0;
  }
  h1 {
    margin: 0.25rem 0 0.75rem;
    font: 700 clamp(2rem, 4vw, 3rem)/1.25 var(--font-display);
    letter-spacing: -0.05em;
  }
  .page-heading p:last-child {
    max-width: 36rem;
    color: var(--latex-muted);
    line-height: 1.6;
    font-size: 0.95rem;
  }
  .create-link,
  .row-action,
  .offer-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0.6rem 0.9rem;
    border: 1px solid currentColor;
    color: var(--latex-text);
    background: transparent;
    font:
      650 0.85rem/1.3 system-ui,
      sans-serif;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
  }
  .create-link:hover,
  .row-action:hover,
  .offer-actions button:hover {
    background: var(--latex-text);
    color: var(--latex-bg);
  }
  .section-nav {
    display: flex;
    gap: 1.5rem;
    border-bottom: 1px solid var(--latex-rule);
    overflow-x: auto;
  }
  .section-nav a {
    padding: 0.8rem 0;
    color: var(--latex-text);
    font-size: 0.85rem;
    font-weight: 650;
    text-decoration: none;
    white-space: nowrap;
  }
  .section-nav span {
    margin-left: 0.2rem;
    color: var(--latex-muted);
  }
  .study-section {
    scroll-margin-top: 5rem;
    margin-top: 2.5rem;
  }
  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 0.7rem;
  }
  h2 {
    font: 700 1.35rem/1.4 var(--font-display);
    letter-spacing: -0.03em;
  }
  .section-heading p {
    margin-top: 0.25rem;
    color: var(--latex-muted);
    font-size: 0.85rem;
  }
  .section-heading > span {
    color: var(--latex-muted);
    font-size: 0.78rem;
    white-space: nowrap;
  }
  .study-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 1.5rem;
    padding: 1.35rem 0;
    border-top: 1px solid var(--latex-rule);
  }
  h3 {
    margin: 0.3rem 0 0.5rem;
    font: 700 1.2rem/1.4 var(--font-display);
    letter-spacing: -0.03em;
  }
  h3 a {
    color: inherit;
    text-decoration: none;
  }
  h3 a:hover {
    text-decoration: underline;
    text-underline-offset: 0.18em;
  }
  .description {
    font-size: 0.9rem;
    line-height: 1.55;
  }
  .details {
    margin-top: 0.7rem;
    color: var(--latex-muted);
    font-size: 0.8rem;
    line-height: 1.55;
  }
  .details span {
    padding: 0 0.25rem;
  }
  .empty {
    padding: 1.5rem;
    border: 1px dashed var(--latex-rule);
    color: var(--latex-muted);
    line-height: 1.6;
  }
  .updated {
    margin-top: 2rem;
    color: var(--latex-muted);
    font-size: 0.75rem;
    text-align: right;
  }
  .notice,
  .transfer-inbox {
    margin: 1rem 0;
    padding: 1rem;
    border: 1px solid var(--latex-rule);
  }
  .notice {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .notice[data-tone="error"] {
    border-left: 4px solid #8b3332;
  }
  .notice button {
    border: 0;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }
  .transfer-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.8rem;
  }
  .transfer-row p {
    margin-top: 0.2rem;
    color: var(--latex-muted);
    font-size: 0.85rem;
  }
  .offer-actions {
    display: flex;
    gap: 0.5rem;
  }
  .offer-actions form {
    margin: 0;
  }
  .offer-actions .primary {
    background: var(--latex-text);
    color: var(--latex-bg);
  }
  :global(.study-page a:focus-visible),
  :global(.study-page button:focus-visible) {
    outline: 3px solid var(--latex-accent);
    outline-offset: 3px;
  }
  @media (max-width: 640px) {
    .study-page {
      padding: 1.3rem 1rem 4rem;
    }
    .page-heading,
    .study-row,
    .transfer-row {
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
    .page-heading {
      margin-bottom: 1.5rem;
    }
    .study-row {
      gap: 1rem;
    }
    .row-action,
    .create-link {
      width: 100%;
    }
    .section-nav {
      gap: 1rem;
    }
  }
</style>
