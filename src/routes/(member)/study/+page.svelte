<script lang="ts">
  import { enhance } from "$app/forms";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";

  let { data } = $props();
  const studies = $derived(data.studies);
  const transferOffers = $derived(data.transferOffers);
  let notice = $state<{ tone: "success" | "error"; message: string } | null>(null);
  let processingStudyId = $state<string | null>(null);

  function statusLabel(status: string) {
    return { recruiting: "모집 중", ongoing: "진행 중", finished: "종료" }[
      status
    ] ?? status;
  }

  function relationshipLabel(relationship: (typeof studies)[number]["myState"]) {
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
          ? result.data as { error?: string; message?: string }
          : null;
      notice = { tone: "error", message: data?.message ?? data?.error ?? "제안을 처리하지 못했습니다." };
    };
  }
</script>

<svelte:head><title>스터디 · SNUMPS</title></svelte:head>

<article class="paper-document study-index-paper">
  <ManuscriptHeader
    title="스터디"
    subtitle="Study Groups and Session Records"
    figure={MANUSCRIPT.FIGURES.STUDY_INDEX}
  />

  <div class="index-toolbar">
    <p>참여 중인 스터디와 주최자 작업을 한곳에서 확인합니다.</p>
    <div>
      <span>{studies.length} Studies</span>
      <a href="/study/apply" class="paper-btn primary small">개설 신청</a>
    </div>
  </div>

  {#if notice}
    <div class="notice" data-tone={notice.tone} role="status">
      <p>{notice.message}</p>
      <button aria-label="알림 닫기" onclick={() => (notice = null)}>×</button>
    </div>
  {/if}

  {#if transferOffers.length}
    <section class="transfer-inbox" aria-label="주최자 전달 제안">
      <header>
        <p>Action Required</p>
        <h2>주최자 전달 제안</h2>
      </header>
      {#each transferOffers as offer (offer.studyId)}
        <article>
          <div>
            <strong>{offer.studyTitle}</strong>
            <p>{offer.fromName} 님이 주최자 역할을 전달하려 합니다.</p>
            <span>{new Date(offer.requestedAt).toLocaleString("ko-KR")}</span>
          </div>
          <div class="offer-actions">
            <form method="POST" action="?/declineTransfer" use:enhance={() => transferEnhancer(offer.studyId, false)}>
              <input type="hidden" name="studyId" value={offer.studyId} />
              <button class="paper-btn small" disabled={processingStudyId === offer.studyId}>거절</button>
            </form>
            <form method="POST" action="?/acceptTransfer" use:enhance={() => transferEnhancer(offer.studyId, true)}>
              <input type="hidden" name="studyId" value={offer.studyId} />
              <button class="paper-btn primary small" disabled={processingStudyId === offer.studyId}>수락</button>
            </form>
          </div>
        </article>
      {/each}
    </section>
  {/if}

  <section class="study-list" aria-label="스터디 목록">
    {#each studies as study (study.id)}
      <article class="study-card" data-status={study.status}>
        <header>
          <div>
            <p>{study.semester} · {relationshipLabel(study.myState)}</p>
            <h2>{study.title}</h2>
          </div>
          <span>{statusLabel(study.status)}</span>
        </header>
        <p class="description">{study.description}</p>
        <dl>
          <div><dt>교재</dt><dd>{study.textbook}</dd></div>
          <div><dt>주최자</dt><dd>{study.organizerNames.join(", ")}</dd></div>
          <div><dt>참여자</dt><dd>{study.participantCount}명</dd></div>
        </dl>
        <div class="card-actions">
          <a class="paper-btn" href={`/study/${study.id}`}>상세 보기</a>
          {#if study.myState === "organizer"}
            <a class="paper-btn primary" href={`/study/${study.id}/manage`}>스터디 관리</a>
          {/if}
        </div>
      </article>
    {:else}
      <p class="empty">참여 중인 스터디가 없습니다.</p>
    {/each}
  </section>

  <footer>데이터 기준 {new Date(data.generatedAt).toLocaleString("ko-KR")}</footer>
</article>

<style>
  .study-index-paper {
    width: min(100%, 980px);
  }

  .index-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    padding-bottom: 0.8rem;
    border-bottom: 1px solid var(--latex-rule);
  }

  .index-toolbar p,
  .description,
  dl,
  dd,
  footer {
    margin: 0;
  }

  .index-toolbar p {
    color: var(--latex-muted);
    font-size: 0.86rem;
  }

  .index-toolbar span,
  .study-card header p,
  .study-card header > span,
  dt,
  footer {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .index-toolbar > div {
    display: flex;
    align-items: center;
    gap: 0.65rem;
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

  .notice[data-tone="error"] {
    border-left-color: var(--latex-accent);
    color: var(--latex-accent);
  }

  .notice p { margin: 0; font-size: 0.8rem; }
  .notice button { border: 0; background: transparent; color: inherit; cursor: pointer; }

  .transfer-inbox {
    margin-bottom: 1rem;
    padding: 0.9rem;
    border: 2px solid var(--latex-text);
  }

  .transfer-inbox > header p,
  .transfer-inbox > header h2,
  .transfer-inbox article p { margin: 0; }

  .transfer-inbox > header p {
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .transfer-inbox > header h2 { margin-top: 0.15rem; }

  .transfer-inbox article {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--latex-rule);
  }

  .transfer-inbox article strong { font-size: 0.86rem; }
  .transfer-inbox article p { margin-top: 0.2rem; color: var(--latex-muted); font-size: 0.76rem; }
  .transfer-inbox article span { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.56rem; }
  .offer-actions,
  .card-actions { display: flex; gap: 0.4rem; }
  .offer-actions form { margin: 0; }

  .study-list {
    display: grid;
    gap: 0.8rem;
  }

  .study-card {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
    border: 1px solid var(--latex-rule);
  }

  .study-card[data-status="ongoing"] {
    border-top: 3px solid var(--latex-accent);
  }

  .study-card header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .study-card header p,
  h2 {
    margin: 0;
  }

  .study-card header p {
    color: var(--latex-accent);
  }

  h2 {
    margin-top: 0.22rem;
    font-size: 1.2rem;
    font-weight: 570;
  }

  .study-card header > span {
    flex: 0 0 auto;
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--latex-rule);
  }

  .description {
    color: var(--latex-muted);
    font-size: 0.84rem;
    line-height: 1.65;
  }

  dl {
    display: grid;
    grid-template-columns: 2fr 1fr 0.6fr;
    gap: 0.7rem;
    padding-top: 0.65rem;
    border-top: 1px solid color-mix(in srgb, var(--latex-rule) 28%, transparent);
  }

  dd {
    margin-top: 0.15rem;
    font-size: 0.78rem;
  }

  .card-actions {
    justify-content: flex-end;
  }

  footer {
    margin-top: 1rem;
    text-align: right;
  }

  @media (max-width: 620px) {
    .index-toolbar {
      align-items: start;
      flex-direction: column;
    }

    .index-toolbar > div,
    .transfer-inbox article {
      align-items: stretch;
      flex-direction: column;
      width: 100%;
    }

    .index-toolbar a,
    .offer-actions button {
      width: 100%;
    }

    dl {
      grid-template-columns: 1fr;
    }

    .card-actions {
      flex-direction: column;
    }

    .card-actions a {
      width: 100%;
    }
  }
</style>
