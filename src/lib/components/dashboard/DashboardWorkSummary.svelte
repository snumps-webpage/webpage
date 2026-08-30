<script lang="ts">
  import type { DashboardRequestItem } from "$lib/domain/dashboard";
  import type { StudyRelationship, StudyStatus } from "$lib/domain/studies";

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
  }: {
    requests: DashboardRequestItem[];
    studies: WorkStudyItem[];
    pendingTransfer: { studyTitle: string; fromMemberName: string } | null;
  } = $props();

  function requestStatus(status: DashboardRequestItem["status"]) {
    return { pending: "심사 대기", approved: "승인", rejected: "반려", withdrawn: "철회" }[status];
  }

  function studyRelation(study: WorkStudyItem) {
    return { organizer: "주최", participant: "참여", pending: "참여 승인 대기", none: "미참여" }[study.relationship];
  }
</script>

{#if pendingTransfer}
  <aside class="transfer-callout">
    <div><span>Action Required</span><strong>주최자 전달 제안</strong></div>
    <p><b>{pendingTransfer.studyTitle}</b>의 {pendingTransfer.fromMemberName} 님이 주최자 역할을 전달하려 합니다.</p>
    <a class="paper-btn primary small" href="/study">확인</a>
  </aside>
{/if}

<div class="work-grid">
  <section class="work-panel">
    <header><div><span>My Proposals</span><h2>개설 신청</h2></div><a href="/seminar/apply">세미나 신청</a></header>
    <div class="record-list">
      {#each requests as request (request.id)}
        <article>
          <div><span>{request.type === "seminar" ? "세미나" : "스터디"}</span><strong>{request.title}</strong></div>
          <div class="record-action"><span data-status={request.status}>{requestStatus(request.status)}</span>{#if request.actionPath}<a href={request.actionPath}>관리</a>{/if}</div>
        </article>
      {:else}
        <p class="empty">개설 신청 내역이 없습니다.</p>
      {/each}
    </div>
    <footer><a href="/study/apply">스터디 개설 신청 →</a></footer>
  </section>

  <section class="work-panel">
    <header><div><span>My Studies</span><h2>참여 스터디</h2></div><a href="/study">전체 보기</a></header>
    <div class="record-list">
      {#each studies as study (study.id)}
        <article>
          <div><span>{study.semester} · {studyRelation(study)}</span><strong>{study.title}</strong></div>
          <div class="record-action"><span>{study.status === "recruiting" ? "모집 중" : study.status === "ongoing" ? "진행 중" : "종료"}</span><a href={study.canManage ? `/study/${study.id}/manage` : `/study/${study.id}`}>{study.canManage ? "관리" : "상세"}</a></div>
        </article>
      {:else}
        <p class="empty">참여 중인 스터디가 없습니다.</p>
      {/each}
    </div>
    <footer><a href="/study">스터디 찾아보기 →</a></footer>
  </section>
</div>

<style>
  .transfer-callout { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 0.8rem 1.2rem; align-items: center; margin-bottom: 1rem; padding: 0.75rem 0.85rem; border: 1px solid var(--latex-rule); border-left: 4px solid var(--latex-accent); }
  .transfer-callout div { display: grid; gap: 0.18rem; }
  .transfer-callout span, .work-panel header span, .record-list article > div:first-child > span { color: var(--latex-muted); font: 700 0.58rem/1.2 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; }
  .transfer-callout p { margin: 0; color: var(--latex-muted); font-size: 0.75rem; }
  .transfer-callout p b { color: var(--latex-text); }
  .work-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
  .work-panel { border: 1px solid var(--latex-rule); }
  .work-panel header { display: flex; align-items: end; justify-content: space-between; gap: 0.6rem; padding: 0.7rem 0.8rem; border-bottom: 2px solid var(--latex-rule); }
  .work-panel header div { display: grid; gap: 0.18rem; }
  .work-panel h2 { margin: 0; font-size: 1rem; font-weight: 560; }
  .work-panel header a, .work-panel footer a, .record-action a { color: var(--latex-text); font: 700 0.62rem/1.2 var(--font-mono); text-decoration: underline; text-underline-offset: 0.18em; }
  .record-list article { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.7rem; align-items: center; min-height: 3.8rem; padding: 0.55rem 0.8rem; border-bottom: 1px solid var(--latex-rule); }
  .record-list article > div:first-child { min-width: 0; display: grid; gap: 0.2rem; }
  .record-list strong { overflow-wrap: anywhere; font-size: 0.76rem; }
  .record-action { display: grid; justify-items: end; gap: 0.25rem; }
  .record-action > span { color: var(--latex-muted); font: 0.58rem/1.2 var(--font-mono); white-space: nowrap; }
  .record-action > span[data-status="rejected"] { color: var(--latex-accent); }
  .work-panel footer { padding: 0.55rem 0.8rem; text-align: right; }
  .empty { margin: 0; padding: 1rem 0.8rem; color: var(--latex-muted); font-size: 0.72rem; }
  @media (max-width: 760px) { .work-grid { grid-template-columns: 1fr; } .transfer-callout { grid-template-columns: 1fr auto; } .transfer-callout p { grid-column: 1 / -1; grid-row: 2; } }
</style>
