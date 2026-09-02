<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import CopyButton from "$lib/components/CopyButton.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import type { PresenterAttendanceOperationResult } from "$lib/domain/attendance";

  let { data } = $props();

  function buildManagement(
    seminars: typeof data.managedSeminars,
    requestedEventId: string | null,
  ) {
    if (seminars.length === 0) return null;
    const selectedEvent =
      seminars.find((seminar) => seminar.id === requestedEventId) ?? seminars[0];
    return {
      events: seminars,
      selectedEvent,
      applicants: selectedEvent.applicants,
      nonApplicantAttendanceCount: selectedEvent.nonApplicantAttendanceCount,
    };
  }

  const initialManagement = untrack(() =>
    buildManagement(data.managedSeminars, page.url.searchParams.get("event")),
  );
  let management = $derived(
    buildManagement(data.managedSeminars, page.url.searchParams.get("event")),
  );
  const selectedIds = new SvelteSet(
    initialManagement?.applicants
      .filter((member) => member.checked)
      .map((member) => member.id) ?? [],
  );
  const savedApplicantIds = new SvelteSet(selectedIds);
  let selectedEventId = $state(initialManagement?.selectedEvent.id ?? "");
  let processing = $state(false);
  let notice = $state<{ tone: "success" | "error"; message: string } | null>(null);

  const selectedCount = $derived(selectedIds.size);
  const allSelected = $derived(
    !!management &&
      management.applicants.length > 0 &&
      selectedIds.size === management.applicants.length,
  );

  $effect(() => {
    if (!management || management.selectedEvent.id === selectedEventId) return;
    selectedEventId = management.selectedEvent.id;
    replaceSelected(
      management.applicants
        .filter((member) => member.checked)
        .map((member) => member.id),
    );
    replaceSaved(
      management.applicants
        .filter((member) => member.checked)
        .map((member) => member.id),
    );
    notice = null;
  });

  function replaceSelected(memberIds: Iterable<string>) {
    selectedIds.clear();
    for (const memberId of memberIds) selectedIds.add(memberId);
  }

  function replaceSaved(memberIds: Iterable<string>) {
    savedApplicantIds.clear();
    for (const memberId of memberIds) savedApplicantIds.add(memberId);
  }

  function setSelected(memberId: string, checked: boolean) {
    if (checked) selectedIds.add(memberId);
    else selectedIds.delete(memberId);
  }

  function toggleAll() {
    if (!management) return;
    if (allSelected) selectedIds.clear();
    else replaceSelected(management.applicants.map((member) => member.id));
  }

  function switchEvent(eventId: string) {
    const next = new URL(page.url);
    next.searchParams.set("event", eventId);
    goto(`${next.pathname}${next.search}`);
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function statusLabel(status: string) {
    return {
      draft: "공개 전",
      active: "출석 진행",
      expired: "종료",
      cancelled: "취소",
    }[status] ?? status;
  }

  function attendanceSourceLabel(member: {
    id: string;
    checkedInAt: string | null;
  }) {
    if (member.checkedInAt && savedApplicantIds.has(member.id)) return "링크 체크인";
    if (member.checkedInAt) return "승인 대기";
    if (savedApplicantIds.has(member.id)) return "수동 확인";
    if (selectedIds.has(member.id)) return "수동 선택";
    return "미확인";
  }
</script>

<svelte:head>
  <title>발표자 출석 관리 · SNUMPS</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<article class="paper-document presenter-register">
  <ManuscriptHeader
    title="세미나 출석 관리"
    subtitle="Presenter Attendance Register"
    figure={MANUSCRIPT.FIGURES.PRESENTER_ATTENDANCE}
  />

  {#if !management}
    <section class="empty-sheet">
      <p class="section-index">No Assigned Events</p>
      <h1>발표자로 배정된 공개 세미나가 없습니다.</h1>
      <p>세미나가 승인·일정 공개된 뒤 본인이 발표자로 등록되면 이곳에서 신청자 출석과 공유 링크를 관리할 수 있습니다.</p>
      <div class="empty-actions">
        <a class="paper-btn primary" href="/seminar/apply">세미나 신청</a>
        <a class="paper-btn" href="/">대시보드</a>
      </div>
    </section>
  {:else}
    <div class="event-toolbar">
      <label for="event-selector">관리할 세미나</label>
      <select
        id="event-selector"
        value={management.selectedEvent.id}
        onchange={(event) => switchEvent(event.currentTarget.value)}
      >
        {#each management.events as event (event.id)}
          <option value={event.id}>{event.title} · {statusLabel(event.status)}</option>
        {/each}
      </select>
    </div>

    <section class="event-index">
      <div class="title-cell">
        <span>Seminar</span>
        <strong>{management.selectedEvent.title}</strong>
      </div>
      <div><span>상태</span><strong>{statusLabel(management.selectedEvent.status)}</strong></div>
      <div><span>선택</span><strong>{selectedCount} / {management.applicants.length}</strong></div>
    </section>

    <section class="schedule-line">
      <div><span>일시</span><strong>{formatDate(management.selectedEvent.date)}</strong></div>
    </section>

    <aside class="merge-note">
      <strong>병합 저장</strong>
      신청자 명부만 수정합니다. 공유 링크 등 다른 경로로 출석한 {management.nonApplicantAttendanceCount}명의 기록은 저장 후에도 보존됩니다.
    </aside>

    {#if notice}
      <div class="notice" data-tone={notice.tone} role="status">
        <p>{notice.message}</p>
        <button aria-label="알림 닫기" onclick={() => (notice = null)}>×</button>
      </div>
    {/if}

    <form
      method="POST"
      action="?/saveAttendance"
      use:enhance={() => {
        processing = true;
        notice = null;
        return async ({ result }) => {
          processing = false;
          if (result.type === "success") {
            const payload = result.data as PresenterAttendanceOperationResult;
            replaceSelected(payload.applicantAttendeeIds);
            replaceSaved(payload.applicantAttendeeIds);
            notice = {
              tone: "success",
              message: `신청자 ${payload.applicantAttendeeIds.length}명을 출석 처리했습니다. 전체 출석 기록은 ${payload.totalAttendanceCount}명입니다.`,
            };
            return;
          }
          const payload = "data" in result ? result.data as { error?: string } : null;
          notice = {
            tone: "error",
            message: payload?.error === "FORBIDDEN"
              ? "이 세미나의 출석을 수정할 권한이 없습니다."
              : "출석을 저장하지 못했습니다.",
          };
        };
      }}
    >
      <input type="hidden" name="eventId" value={management.selectedEvent.id} />
      <div class="register-heading">
        <div><p>Applicant Register</p><h2>신청자 명부</h2></div>
        <button type="button" class="paper-btn small" onclick={toggleAll}>
          {allSelected ? "전체 해제" : "전체 선택"}
        </button>
      </div>

      <div class="attendance-list">
        {#each management.applicants as member, index (member.id)}
          <label class="attendance-row" class:checked={selectedIds.has(member.id)}>
            <span class="row-index">{String(index + 1).padStart(2, "0")}</span>
            <input
              type="checkbox"
              name="attendeeIds"
              value={member.id}
              checked={selectedIds.has(member.id)}
              onchange={(event) => setSelected(member.id, event.currentTarget.checked)}
            />
            <span class="check-mark" aria-hidden="true">{selectedIds.has(member.id) ? "✓" : ""}</span>
            <span class="member-name">{member.name}</span>
            <span class="member-department">{member.department}</span>
            <span class="checkin-source">{attendanceSourceLabel(member)}</span>
          </label>
        {:else}
          <p class="empty-row">신청자가 없습니다.</p>
        {/each}
      </div>

      <div class="register-actions">
        <div class="share-link">
          <span>참여자용 출석 링크</span>
          <code>{management.selectedEvent.attendPath}</code>
          <div class="share-actions">
            <CopyButton
              text={`${page.url.origin}${management.selectedEvent.attendPath}`}
              title="출석 링크 복사"
            />
            <a class="paper-btn small" href={management.selectedEvent.attendPath} target="_blank">열기</a>
          </div>
        </div>
        <button class="paper-btn primary" disabled={processing}>
          {processing ? "저장 중…" : `${selectedCount}명 출석 저장`}
        </button>
      </div>
    </form>
  {/if}
</article>

<style>
  .presenter-register { width: min(100%, 980px); }
  .event-toolbar { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 0.65rem; margin-bottom: 0.85rem; }
  .event-toolbar label, .event-index span, .schedule-line span, .register-heading p, .share-link > span, .section-index { color: var(--latex-muted); font: 700 0.58rem/1.2 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; }
  select { width: 100%; min-height: 2.65rem; padding: 0.55rem 0.7rem; border: 1px solid var(--latex-rule); background: var(--latex-bg); color: var(--latex-text); }
  .event-index { display: grid; grid-template-columns: 2fr 0.7fr 0.7fr; border: 1px solid var(--latex-rule); }
  .event-index > div, .schedule-line > div { min-width: 0; display: grid; gap: 0.18rem; padding: 0.65rem 0.75rem; border-right: 1px solid var(--latex-rule); }
  .event-index > div:last-child, .schedule-line > div:last-child { border-right: 0; }
  .event-index strong, .schedule-line strong { overflow-wrap: anywhere; font-size: 0.78rem; font-weight: 560; }
  .schedule-line { display: grid; grid-template-columns: 1fr; border: 1px solid var(--latex-rule); border-top: 0; }
  .merge-note { margin: 0.8rem 0; padding: 0.7rem 0.8rem; border-left: 3px solid var(--latex-accent); background: color-mix(in srgb, var(--latex-accent) 4%, transparent); color: var(--latex-muted); font-size: 0.75rem; line-height: 1.6; }
  .merge-note strong { color: var(--latex-text); margin-right: 0.4rem; }
  .notice { display: flex; justify-content: space-between; gap: 0.8rem; margin-bottom: 0.75rem; padding: 0.65rem 0.75rem; border: 1px solid var(--latex-rule); border-left: 4px solid var(--latex-text); font-size: 0.76rem; }
  .notice[data-tone="error"] { border-left-color: var(--color-danger-text); color: var(--color-danger-text); }
  .notice p { margin: 0; }
  .notice button { border: 0; background: transparent; color: inherit; cursor: pointer; }
  form { border: 1px solid var(--latex-rule); }
  .register-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; padding: 0.7rem 0.8rem; border-bottom: 2px solid var(--latex-rule); }
  .register-heading p, .register-heading h2 { margin: 0; }
  .register-heading h2 { margin-top: 0.15rem; font-size: 1.05rem; font-weight: 560; }
  .attendance-list { padding: 0.45rem; }
  .attendance-row { display: grid; grid-template-columns: 2rem 1.2rem 1.2rem minmax(7rem, 1fr) minmax(8rem, 1fr) auto; align-items: center; min-height: 3.1rem; border-bottom: 1px solid var(--latex-rule); cursor: pointer; }
  .attendance-row:last-child { border-bottom: 0; }
  .attendance-row.checked { background: color-mix(in srgb, var(--latex-text) 4%, transparent); }
  .attendance-row input { position: absolute; opacity: 0; pointer-events: none; }
  .row-index, .checkin-source { color: var(--latex-muted); font: 0.58rem/1.2 var(--font-mono); }
  .check-mark { width: 1rem; height: 1rem; display: grid; place-items: center; border: 1px solid var(--latex-rule); font-size: 0.7rem; }
  .member-name { font-size: 0.8rem; font-weight: 650; }
  .member-department { color: var(--latex-muted); font-size: 0.72rem; }
  .checkin-source { justify-self: end; padding-right: 0.35rem; }
  .empty-row { margin: 0; padding: 1rem; color: var(--latex-muted); text-align: center; font-size: 0.75rem; }
  .register-actions { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.8rem; align-items: end; padding: 0.8rem; border-top: 2px solid var(--latex-rule); }
  .share-link { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.25rem 0.5rem; }
  .share-link > span, .share-link code { grid-column: 1; }
  .share-link code { min-width: 0; overflow-wrap: anywhere; font-size: 0.67rem; }
  .share-actions { grid-column: 2; grid-row: 1 / span 2; display: flex; align-items: center; gap: 0.35rem; }
  .empty-sheet { padding: clamp(1rem, 4vw, 1.5rem); border: 1px solid var(--latex-rule); }
  .empty-sheet h1 { margin: 0.4rem 0; font-size: 1.25rem; font-weight: 560; }
  .empty-sheet > p:last-of-type { color: var(--latex-muted); font-size: 0.78rem; line-height: 1.7; }
  .empty-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
  @media (max-width: 700px) { .event-toolbar { grid-template-columns: 1fr; } .event-index { grid-template-columns: 1fr 1fr; } .event-index .title-cell { grid-column: 1 / -1; border-right: 0; border-bottom: 1px solid var(--latex-rule); } .schedule-line { grid-template-columns: 1fr; } .schedule-line > div { border-right: 0; border-bottom: 1px solid var(--latex-rule); } .schedule-line > div:last-child { border-bottom: 0; } .attendance-row { grid-template-columns: 1.6rem 1.1rem minmax(5rem, 1fr) auto; gap: 0.3rem; padding: 0.45rem 0.2rem; } .attendance-row .check-mark { grid-column: 2; } .attendance-row .member-name { grid-column: 3; } .member-department { grid-column: 3; grid-row: 2; } .checkin-source { grid-column: 4; grid-row: 1 / span 2; } .attendance-row input { display: none; } .register-actions { grid-template-columns: 1fr; } .register-actions > :global(.paper-btn) { width: 100%; } }
  @media (max-width: 430px) { .share-link { grid-template-columns: 1fr; } .share-actions { grid-column: 1; grid-row: auto; justify-content: stretch; } .share-actions :global(.paper-btn) { flex: 1; text-align: center; } }
</style>
