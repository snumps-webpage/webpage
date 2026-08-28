<script lang="ts">
  import { enhance } from "$app/forms";
  import { untrack } from "svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import type { StudyOperationResult } from "$lib/domain/studies";
  import { MANUSCRIPT } from "$lib/constants";

  let { data } = $props();
  let study = $state(structuredClone(untrack(() => data.study)));
  let processing = $state(false);
  let notice = $state<{ tone: "success" | "error"; message: string } | null>(null);

  const statusLabel = $derived(
    { recruiting: "모집 중", ongoing: "진행 중", finished: "종료" }[study.status],
  );
  const relationshipLabel = $derived(
    {
      organizer: "주최자",
      participant: "참여 중",
      pending: "승인 대기",
      none: "미참여",
    }[study.relationship],
  );

  function handleResult(result: StudyOperationResult) {
    if (result.operation === "studyJoined") {
      study.relationship = "pending";
      study.canJoin = false;
      study.canLeave = true;
      notice = { tone: "success", message: "참여 신청을 보냈습니다. 주최자 승인을 기다려 주세요." };
    }
    if (result.operation === "studyLeft") {
      const wasParticipant = study.relationship === "participant";
      study.relationship = "none";
      study.canJoin = study.status === "recruiting";
      study.canLeave = false;
      if (wasParticipant) study.participantCount = Math.max(0, study.participantCount - 1);
      notice = { tone: "success", message: "스터디 참여 상태를 해제했습니다." };
    }
  }

  function actionEnhancer() {
    processing = true;
    notice = null;
    return async ({ result }: { result: import("@sveltejs/kit").ActionResult }) => {
      processing = false;
      if (result.type === "success") {
        handleResult(result.data as StudyOperationResult);
        return;
      }
      const data = result.type === "failure" ? result.data as { error?: string } : null;
      notice = { tone: "error", message: data?.error ?? "참여 상태를 변경하지 못했습니다." };
    };
  }
</script>

<svelte:head><title>{study.title} · SNUMPS 스터디</title></svelte:head>

<article class="paper-document study-detail-paper">
  <ManuscriptHeader
    title={study.title}
    subtitle="Study Enrollment Sheet"
    figure={MANUSCRIPT.FIGURES.STUDY_DETAIL}
  />

  <div class="detail-index">
    <div><span>Term</span><strong>{study.semester}</strong></div>
    <div><span>Status</span><strong>{statusLabel}</strong></div>
    <div><span>Relation</span><strong>{relationshipLabel}</strong></div>
    <div><span>Members</span><strong>{study.participantCount}</strong></div>
  </div>

  {#if notice}
    <div class="notice" data-tone={notice.tone} role="status">
      <p>{notice.message}</p>
      <button aria-label="알림 닫기" onclick={() => (notice = null)}>×</button>
    </div>
  {/if}

  <div class="detail-grid">
    <section class="abstract-sheet">
      <p class="eyebrow">01 · Study Abstract</p>
      <h2>진행 내용</h2>
      <p class="description">{study.description}</p>
      <dl>
        <div><dt>교재·자료</dt><dd>{study.textbook}</dd></div>
        <div><dt>주최자</dt><dd>{study.organizers.map((member) => `${member.name} · ${member.department}`).join(", ")}</dd></div>
        <div><dt>운영 방식</dt><dd>{study.note}</dd></div>
      </dl>
    </section>

    <aside class="enrollment-sheet">
      <p class="eyebrow">02 · Enrollment</p>
      <h2>참여 상태</h2>
      <div class="relationship-stamp" data-relationship={study.relationship}>{relationshipLabel}</div>

      {#if study.relationship === "organizer"}
        <p>이 스터디의 주최자입니다. 참여자 승인과 회차·출석 관리는 관리 화면에서 진행합니다.</p>
        <a class="paper-btn primary" href={`/study/${study.id}/manage`}>스터디 관리</a>
      {:else if study.relationship === "participant"}
        <p>현재 참여자로 등록되어 있습니다. 나가면 참여자 명단에서 즉시 제외됩니다.</p>
        <form method="POST" action="?/leave" use:enhance={actionEnhancer}>
          <button
            class="paper-btn danger"
            disabled={processing}
            onclick={(event) => {
              if (!confirm("이 스터디에서 나가시겠습니까?")) event.preventDefault();
            }}
          >스터디 나가기</button>
        </form>
      {:else if study.relationship === "pending"}
        <p>주최자가 참여 신청을 검토하고 있습니다. 승인 전에는 신청을 취소할 수 있습니다.</p>
        <form method="POST" action="?/leave" use:enhance={actionEnhancer}>
          <button class="paper-btn" disabled={processing}>참여 신청 취소</button>
        </form>
      {:else if study.canJoin}
        <p>참여 신청을 보내면 주최자의 승인을 거쳐 참여자 명단에 추가됩니다.</p>
        <form method="POST" action="?/join" use:enhance={actionEnhancer}>
          <button class="paper-btn primary" disabled={processing}>참여 신청</button>
        </form>
      {:else}
        <p>현재는 새 참여 신청을 받지 않습니다.</p>
      {/if}
    </aside>
  </div>

  <footer><a href="/study" class="paper-btn">스터디 목록</a></footer>
</article>

<style>
  .study-detail-paper { width: min(100%, 1080px); }
  .detail-index {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-bottom: 1rem;
    border: 1px solid var(--latex-rule);
  }
  .detail-index div {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.7rem 0.8rem;
    border-right: 1px solid var(--latex-rule);
  }
  .detail-index div:last-child { border-right: 0; }
  .detail-index span,
  .eyebrow,
  dt {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .detail-index strong { font-family: var(--font-math); font-weight: 560; }
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
  .notice[data-tone="error"] { border-left-color: var(--latex-accent); color: var(--latex-accent); }
  .notice p { margin: 0; font-size: 0.8rem; }
  .notice button { border: 0; background: transparent; color: inherit; cursor: pointer; }
  .detail-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(17rem, 0.65fr);
    gap: 0.9rem;
    align-items: start;
  }
  .abstract-sheet,
  .enrollment-sheet { padding: 1rem; border: 1px solid var(--latex-rule); }
  .eyebrow,
  h2,
  .description,
  dl,
  dd,
  .enrollment-sheet > p { margin: 0; }
  .eyebrow { color: var(--latex-accent); }
  h2 { margin-top: 0.2rem; font-size: 1.18rem; font-weight: 570; }
  .description { margin-top: 0.9rem; font-size: 0.86rem; line-height: 1.75; }
  dl { display: grid; gap: 0.55rem; margin-top: 1rem; padding-top: 0.8rem; border-top: 1px solid var(--latex-rule); }
  dl div { display: grid; grid-template-columns: 6rem minmax(0, 1fr); gap: 0.75rem; }
  dd { font-size: 0.8rem; line-height: 1.55; }
  .relationship-stamp {
    margin: 1rem 0 0.75rem;
    padding: 0.7rem;
    border: 2px double var(--latex-rule);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 750;
    letter-spacing: 0.12em;
    text-align: center;
  }
  .relationship-stamp[data-relationship="pending"] { color: var(--latex-accent); }
  .enrollment-sheet > p { color: var(--latex-muted); font-size: 0.78rem; line-height: 1.65; }
  .enrollment-sheet form,
  .enrollment-sheet > a { display: block; margin-top: 0.8rem; }
  .enrollment-sheet button,
  .enrollment-sheet > a { width: 100%; }
  :global(.paper-btn.danger) { border-color: var(--latex-accent); color: var(--latex-accent); }
  footer { display: flex; justify-content: flex-start; margin-top: 1rem; padding-top: 0.8rem; border-top: 1px solid var(--latex-rule); }
  @media (max-width: 760px) {
    .detail-index { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .detail-index div:nth-child(2) { border-right: 0; }
    .detail-index div:nth-child(-n + 2) { border-bottom: 1px solid var(--latex-rule); }
    .detail-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 460px) {
    .detail-index { grid-template-columns: 1fr; }
    .detail-index div { border-right: 0; border-bottom: 1px solid var(--latex-rule); }
    .detail-index div:last-child { border-bottom: 0; }
    dl div { grid-template-columns: 1fr; gap: 0.18rem; }
  }
</style>
