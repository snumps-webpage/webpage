<script lang="ts">
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { ACTIVITY_TYPES, MANUSCRIPT } from "$lib/constants";
  import type { AdminActivityRecord } from "$lib/domain/admin-records";

  let { data, form } = $props();
  let query = $state("");
  const activities = $derived.by(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return data.activities.filter((activity: AdminActivityRecord) =>
      !normalized || [activity.title, activity.type, activity.date].some((value) => value.toLocaleLowerCase("ko-KR").includes(normalized)),
    );
  });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const issuesFor = (scope: string, id?: string): Record<string, string> =>
    form?.scope === scope && (id === undefined || form?.id === id)
      ? (form.issues ?? {}) as Record<string, string>
      : {};
  const createIssues = $derived(issuesFor("create"));
  const operationLabel: Record<string, string> = {
    activityCreated: "활동 기록을 생성했습니다.",
    activityUpdated: "활동 기록을 수정했습니다.",
    attendeesReplaced: "참석자 명단을 관리자 권한으로 교체했습니다.",
    activityDeleted: "활동 기록을 삭제했습니다.",
  };
</script>

<svelte:head><title>활동 기록 관리 · SNUMPS 관리자</title></svelte:head>

<article class="paper-document activity-admin-paper">
  <ManuscriptHeader title="활동 기록 관리" subtitle="Activity Record Editor" figure={MANUSCRIPT.FIGURES.ADMIN_ACTIVITIES} />
  <AdminSectionNav />
  <p class="scope-note">이 화면의 참석자 지정은 관리자 전권 교체 예외입니다. 발표자·주최자 출석 저장의 병합 규칙과 다릅니다.</p>

  {#if form?.success && form.operation}<p class="paper-status-note success" role="status">{operationLabel[form.operation]}</p>{/if}
  {#if form?.error === "CONFLICT"}<p class="paper-status-note error" role="alert">연결된 이벤트가 있어 삭제할 수 없습니다. 먼저 이벤트와 출석 큐를 정리해 주세요.</p>{/if}

  <section class="create-panel">
    <h2>1. 새 활동 기록</h2>
    <form method="POST" action="?/create" class="record-form">
      <label><span class="paper-label">활동명</span><input name="title" value={form?.scope === "create" ? form.values?.title ?? "" : ""} aria-invalid={!!createIssues.title} />{#if createIssues.title}<small>{createIssues.title}</small>{/if}</label>
      <label><span class="paper-label">유형</span><select name="type" aria-invalid={!!createIssues.type}>{#each ACTIVITY_TYPES as type (type)}<option value={type} selected={(form?.scope === "create" ? form.values?.type : "세미나") === type}>{type}</option>{/each}</select>{#if createIssues.type}<small>{createIssues.type}</small>{/if}</label>
      <label><span class="paper-label">날짜</span><input type="date" name="date" value={form?.scope === "create" ? form.values?.date ?? today : today} aria-invalid={!!createIssues.date} />{#if createIssues.date}<small>{createIssues.date}</small>{/if}</label>
      <button class="paper-btn primary" type="submit">기록 생성</button>
    </form>
  </section>

  <section class="record-index">
    <div class="section-title"><div><span>2.</span><h2>기존 활동 기록</h2></div><label><span class="paper-label">검색</span><input type="search" bind:value={query} placeholder="제목, 유형 또는 날짜" /></label></div>
    <div class="record-list">
      {#each activities as activity (activity.id)}
        {@const updateIssues = issuesFor("update", activity.id)}
        <details class="record-card">
          <summary><div><span>{activity.date} · {activity.type}</span><strong>{activity.title}</strong></div><small>{activity.attendeeIds.length}명 참석 · 이벤트 {activity.linkedEventIds.length}개</small></summary>
          <div class="record-body">
            <form method="POST" action="?/update" class="record-form"><input type="hidden" name="id" value={activity.id} /><label><span class="paper-label">활동명</span><input name="title" value={activity.title} aria-invalid={!!updateIssues.title} />{#if updateIssues.title}<small>{updateIssues.title}</small>{/if}</label><label><span class="paper-label">유형</span><select name="type">{#each ACTIVITY_TYPES as type (type)}<option value={type} selected={type === activity.type}>{type}</option>{/each}</select></label><label><span class="paper-label">날짜</span><input type="date" name="date" value={activity.date} aria-invalid={!!updateIssues.date} />{#if updateIssues.date}<small>{updateIssues.date}</small>{/if}</label><button class="paper-btn" type="submit">기본 정보 수정</button></form>
            <form method="POST" action="?/setAttendees" class="attendee-form" onsubmit={(event) => { if (!confirm("현재 참석자 명단을 선택한 회원으로 전체 교체할까요?")) event.preventDefault(); }}><input type="hidden" name="id" value={activity.id} /><fieldset><legend>참석자 전체 교체</legend><div class="member-picker">{#each data.members as member (member.id)}<label><input type="checkbox" name="attendeeIds" value={member.id} checked={activity.attendeeIds.includes(member.id)} /><span>{member.name}<small>{member.department}</small></span></label>{/each}</div></fieldset><button class="paper-btn" type="submit">참석자 교체</button></form>
            <form method="POST" action="?/delete" class="delete-row" onsubmit={(event) => { if (!confirm(`'${activity.title}' 활동 기록을 삭제할까요?`)) event.preventDefault(); }}><input type="hidden" name="id" value={activity.id} /><span>{activity.linkedEventIds.length ? "연결 이벤트가 있어 현재 삭제 불가" : "삭제 후 복구는 S3 버전 이력에서만 가능"}</span><button class="paper-btn small" type="submit" disabled={activity.linkedEventIds.length > 0}>기록 삭제</button></form>
          </div>
        </details>
      {:else}<p class="empty">검색 조건에 맞는 활동이 없습니다.</p>{/each}
    </div>
  </section>
  <p class="freshness">프리뷰 데이터 기준 {new Date(data.generatedAt).toLocaleString("ko-KR")}</p>
</article>

<style>
  .activity-admin-paper { width: min(100%, 1120px); }
  .scope-note { margin: 0 0 1rem; color: var(--latex-muted); font-size: 0.78rem; }
  .create-panel, .record-index { margin-top: 1.2rem; padding-top: 0.8rem; border-top: 1px solid var(--latex-rule); }
  h2 { margin: 0; font-size: 1.08rem; font-weight: 570; }
  .record-form { display: grid; grid-template-columns: minmax(0, 1fr) 10rem 10rem auto; gap: 0.65rem; align-items: end; margin-top: 0.7rem; }
  .record-form input, .record-form select, .section-title input { width: 100%; min-height: 2.7rem; padding: 0.55rem 0.65rem; }
  form small { display: block; margin-top: 0.2rem; color: var(--color-danger-text); font-size: 0.66rem; }
  .section-title { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 0.7rem; }
  .section-title > div { display: flex; align-items: baseline; gap: 0.5rem; }.section-title > div > span { color: var(--latex-accent); font-family: var(--font-mono); font-size: 0.7rem; font-weight: 700; }
  .section-title label { width: min(100%, 21rem); }
  .record-list { display: grid; gap: 0.55rem; }
  .record-card { border: 1px solid var(--latex-rule); }
  summary { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.72rem 0.8rem; cursor: pointer; }
  summary div { display: grid; }summary span, summary small, .delete-row span { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.57rem; }summary strong { font-size: 0.96rem; font-weight: 570; }
  .record-body { display: grid; gap: 0.9rem; padding: 0.8rem; border-top: 1px solid var(--latex-rule); }
  .attendee-form { display: flex; align-items: end; gap: 0.7rem; }.attendee-form fieldset { flex: 1; min-width: 0; margin: 0; padding: 0.7rem; border: 1px solid var(--latex-rule); }.attendee-form legend { padding: 0 0.3rem; font-family: var(--font-mono); font-size: 0.6rem; font-weight: 700; }
  .member-picker { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.35rem; }.member-picker label { display: flex; align-items: center; gap: 0.45rem; padding: 0.35rem; border: 1px solid color-mix(in srgb, var(--latex-rule) 30%, transparent); }.member-picker input { margin: 0; }.member-picker span { display: grid; font-size: 0.72rem; }.member-picker small { margin: 0; color: var(--latex-muted); font-size: 0.56rem; }
  .delete-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-top: 0.7rem; border-top: 1px solid var(--latex-rule); }
  .freshness { margin: 1rem 0 0; color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.56rem; text-align: right; text-transform: uppercase; }
  @media (max-width: 800px) { .record-form { grid-template-columns: 1fr 1fr; }.record-form label:first-of-type { grid-column: 1 / -1; }.member-picker { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { .record-form { grid-template-columns: 1fr; }.record-form label:first-of-type { grid-column: auto; }.section-title, .attendee-form, .delete-row, summary { align-items: stretch; flex-direction: column; }.section-title label { width: 100%; }.member-picker { grid-template-columns: 1fr; }.attendee-form button, .delete-row button { width: 100%; } }
</style>
