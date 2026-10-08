<script lang="ts">
  import type { OwnSeminarRequestItem } from "$lib/domain/seminar-progress";
  import DashboardSeminarProgress from "./DashboardSeminarProgress.svelte";
  import {
    STUDY_STATUS_LABELS,
    type StudyRelationship,
    type StudyStatus,
  } from "$lib/domain/studies";

  interface WorkStudyItem {
    id: string;
    title: string;
    semester: string;
    status: StudyStatus;
    relationship: StudyRelationship;
    canManage: boolean;
  }

  let {
    requests,
    studies,
    pendingTransfer,
    canParticipate,
    canViewMemberZone = true,
    pendingTransferCount = 1,
  }: {
    requests: OwnSeminarRequestItem[];
    canParticipate: boolean;
    canViewMemberZone?: boolean;
    pendingTransferCount?: number;
    studies: WorkStudyItem[];
    pendingTransfer: { studyTitle: string; fromMemberName: string } | null;
  } = $props();

  function studyRelation(study: WorkStudyItem) {
    return {
      organizer: "주최",
      participant: "참여",
      pending: "참여 승인 대기",
      none: "미참여",
    }[study.relationship];
  }
</script>

{#if pendingTransfer}
  <aside class="transfer-callout">
    <div>
      <span>확인할 제안</span><strong
        >주최자 전달 제안{pendingTransferCount > 1
          ? ` ${pendingTransferCount}건`
          : ""}</strong
      >
    </div>
    <p>
      <b>{pendingTransfer.studyTitle}</b>의 {pendingTransfer.fromMemberName} 님이
      주최자 역할을 전달하려 합니다.
    </p>
    <a
      class="paper-btn primary small"
      href={canViewMemberZone ? "/study" : "/signup"}
      >{canViewMemberZone ? "제안 확인" : "학기 등록 확인"}</a
    >
  </aside>
{/if}

<DashboardSeminarProgress {requests} {canParticipate} />

<div class="work-grid">
  <section
    class="work-panel"
    id="home-studies"
    aria-labelledby="home-studies-heading"
  >
    <header>
      <div>
        <span>§ 02 · 내 스터디</span>
        <h2 id="home-studies-heading">내 스터디</h2>
      </div>
      <a href={canViewMemberZone ? "/study" : "/signup"}
        >{canViewMemberZone ? "전체 보기" : "등록 확인"}</a
      >
    </header>
    <div class="record-list">
      {#each studies as study (study.id)}
        <article>
          <div>
            <span>{study.semester} · {studyRelation(study)}</span><strong
              >{study.title}</strong
            >
          </div>
          <div class="record-action">
            <span>{STUDY_STATUS_LABELS[study.status]}</span><a
              href={!canViewMemberZone
                ? "/signup"
                : study.canManage
                  ? `/study/${study.id}/manage`
                  : `/study/${study.id}`}
              >{!canViewMemberZone
                ? "학기 등록 확인"
                : study.canManage
                  ? "주최자 화면"
                  : "상태 보기"}</a
            >
          </div>
        </article>
      {:else}
        <p class="empty">연결된 스터디가 없습니다.</p>
      {/each}
    </div>
    <footer>
      <a href={canViewMemberZone ? "/study" : "/signup"}
        >{canViewMemberZone ? "스터디 찾아보기 →" : "학기 등록 확인 →"}</a
      >
    </footer>
  </section>
</div>

<style>
  .transfer-callout {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.8rem 1.2rem;
    align-items: center;
    margin-bottom: 1rem;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--latex-rule);
    border-left: 4px solid var(--latex-accent);
  }
  .transfer-callout div {
    display: grid;
    gap: 0.18rem;
  }
  .transfer-callout span,
  .work-panel header span,
  .record-list article > div:first-child > span {
    color: var(--latex-muted);
    font: 700 0.58rem/1.2 var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .transfer-callout p {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.75rem;
  }
  .transfer-callout p b {
    color: var(--latex-text);
  }
  .work-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .work-panel {
    border: 1px solid var(--latex-rule);
  }
  .work-panel header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.7rem 0.8rem;
    border-bottom: 2px solid var(--latex-rule);
  }
  .work-panel header div {
    display: grid;
    gap: 0.18rem;
  }
  .work-panel h2 {
    font-family: var(--font-display);
    margin: 0;
    font-size: 1rem;
    font-weight: 560;
  }
  .work-panel header a,
  .work-panel footer a,
  .record-action a {
    color: var(--latex-text);
    font: 700 0.62rem/1.2 var(--font-mono);
    text-decoration: underline;
    text-underline-offset: 0.18em;
  }
  .record-list article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.7rem;
    align-items: center;
    min-height: 3.8rem;
    padding: 0.55rem 0.8rem;
    border-bottom: 1px solid var(--latex-rule);
  }
  .record-list article > div:first-child {
    min-width: 0;
    display: grid;
    gap: 0.2rem;
  }
  .record-list strong {
    overflow-wrap: anywhere;
    font-size: 0.76rem;
  }
  .record-action {
    display: grid;
    justify-items: end;
    gap: 0.25rem;
  }
  .record-action > span {
    color: var(--latex-muted);
    font: 0.58rem/1.2 var(--font-mono);
    white-space: nowrap;
  }
  .work-panel footer {
    padding: 0.55rem 0.8rem;
    text-align: right;
  }
  .empty {
    margin: 0;
    padding: 1rem 0.8rem;
    color: var(--latex-muted);
    font-size: 0.72rem;
  }
  @media (max-width: 760px) {
    .work-grid {
      grid-template-columns: 1fr;
    }
    .transfer-callout {
      grid-template-columns: 1fr auto;
    }
    .transfer-callout p {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
</style>
