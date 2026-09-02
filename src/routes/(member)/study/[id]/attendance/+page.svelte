<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import CopyButton from "$lib/components/CopyButton.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";

  let { data } = $props();
  const sessions = $derived(data.sessions);
  const selectedSession = $derived(
    sessions.find((s) => s.eventId === page.url.searchParams.get("event")) ??
      sessions[sessions.length - 1] ??
      null,
  );
  const attendees = $derived(
    selectedSession
      ? data.participants.map((member) => ({
          ...member,
          attended: selectedSession.attendeeIds.includes(member.id),
        }))
      : [],
  );
  const selectedIds = new SvelteSet(
    untrack(() =>
      attendees.filter((member) => member.attended).map((member) => member.id),
    ),
  );
  let syncedEventId = $state(untrack(() => selectedSession?.eventId ?? null));
  let processing = $state(false);
  let notice = $state<{ tone: "success" | "error"; message: string } | null>(null);

  const selectedCount = $derived(selectedIds.size);
  const allSelected = $derived(
    attendees.length > 0 && selectedIds.size === attendees.length,
  );

  $effect(() => {
    const eventId = selectedSession?.eventId ?? null;
    if (eventId === syncedEventId) return;
    syncedEventId = eventId;
    replaceSelected(
      attendees.filter((member) => member.attended).map((member) => member.id),
    );
    notice = null;
  });

  function replaceSelected(memberIds: Iterable<string>) {
    selectedIds.clear();
    for (const memberId of memberIds) selectedIds.add(memberId);
  }

  function setSelected(memberId: string, checked: boolean) {
    if (checked) selectedIds.add(memberId);
    else selectedIds.delete(memberId);
  }

  function toggleAll() {
    if (allSelected) selectedIds.clear();
    else replaceSelected(attendees.map((member) => member.id));
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

  function sessionStatusLabel(status: string) {
    return { active: "출석 진행", expired: "종료", cancelled: "취소" }[
      status
    ] ?? status;
  }

  function switchSession(eventId: string) {
    const next = new URL(page.url);
    next.searchParams.set("event", eventId);
    goto(`${next.pathname}${next.search}`);
  }
</script>

<svelte:head>
  <title>{selectedSession ? `${selectedSession.title} 출석부` : "출석부"} · {data.studyTitle}</title>
</svelte:head>

<article class="paper-document attendance-register">
  <ManuscriptHeader
    title={selectedSession ? `${data.studyTitle} · ${selectedSession.title}` : data.studyTitle}
    subtitle="Organizer Attendance Register"
    figure={MANUSCRIPT.FIGURES.STUDY_ATTENDANCE}
  />

  <div class="attendance-toolbar">
    <label for="session-selector">회차 선택</label>
    <select
      id="session-selector"
      value={selectedSession?.eventId}
      onchange={(event) => switchSession(event.currentTarget.value)}
    >
      {#each sessions as session (session.eventId)}
        <option value={session.eventId}>
          {session.title} · {formatDate(session.date)}
        </option>
      {/each}
    </select>
    <a href={`/study/${data.studyId}/manage`} class="paper-btn small">관리 허브</a>
  </div>

  {#if selectedSession}
    <section class="session-index">
      <div><span>회차</span><strong>{selectedSession.sessionNo ?? "-"}</strong></div>
      <div><span>시작</span><strong>{formatDate(selectedSession.date)}</strong></div>
      <div><span>상태</span><strong>{sessionStatusLabel(selectedSession.status)}</strong></div>
      <div><span>선택</span><strong>{selectedCount} / {attendees.length}</strong></div>
    </section>

    <aside class="merge-note">
      <strong>회차별 출석부</strong>
      이 화면에서 관리하는 참여자만 갱신하며, 다른 출석 경로에서 기록된 관리 범위 밖의 값은 보존합니다.
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
        return async ({ result, update }) => {
          processing = false;
          if (result.type === "success") {
            await update();
            const savedIds = attendees
              .filter((member) => member.attended)
              .map((member) => member.id);
            replaceSelected(savedIds);
            notice = {
              tone: "success",
              message: `${savedIds.length}명의 참여자 출석을 저장했습니다. 관리 범위 밖의 기존 출석은 보존했습니다.`,
            };
            return;
          }
          const payload = "data" in result ? result.data as { error?: string; message?: string } : null;
          notice = { tone: "error", message: payload?.message ?? payload?.error ?? "출석을 저장하지 못했습니다." };
        };
      }}
    >
      <input type="hidden" name="eventId" value={selectedSession.eventId} />

      <div class="register-heading">
        <div>
          <p>Participant Register</p>
          <h2>참여자 명부</h2>
        </div>
        <button type="button" class="paper-btn small" onclick={toggleAll}>
          {allSelected ? "전체 해제" : "전체 선택"}
        </button>
      </div>

      <div class="attendance-list">
        {#each attendees as member, index (member.id)}
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
            <span class="checkin-source">
              {member.attended ? "기존 체크인" : "미체크인"}
            </span>
          </label>
        {/each}
      </div>

      <div class="register-actions">
        <div class="share-link">
          <span>참여자용 출석 링크</span>
          <code>{selectedSession.attendPath}</code>
          <CopyButton
            text={`${page.url.origin}${selectedSession.attendPath}`}
            title="출석 링크 복사"
          />
        </div>
        <button class="paper-btn primary" disabled={attendees.length === 0 || processing}>
          {processing ? "저장 중…" : `${selectedCount}명 출석 저장`}
        </button>
      </div>
    </form>
  {:else}
    <p class="empty-line">아직 생성된 회차가 없습니다.</p>
  {/if}
</article>

<style>
  .attendance-register {
    width: min(100%, 980px);
  }

  .attendance-toolbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 0.9rem;
  }

  .attendance-toolbar label,
  .session-index span,
  .register-heading p,
  .share-link > span {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  select {
    width: 100%;
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--latex-rule);
  }

  .session-index {
    display: grid;
    grid-template-columns: 0.6fr 1.7fr 0.8fr 0.8fr;
    border: 1px solid var(--latex-rule);
  }

  .session-index div {
    display: grid;
    gap: 0.15rem;
    padding: 0.65rem 0.75rem;
    border-right: 1px solid var(--latex-rule);
  }

  .session-index div:last-child {
    border-right: 0;
  }

  .session-index strong {
    font-size: 0.8rem;
    font-weight: 560;
  }

  .merge-note {
    margin: 0.8rem 0;
    padding: 0.7rem 0.8rem;
    border-left: 3px solid var(--latex-accent);
    background: color-mix(in srgb, var(--latex-accent) 4%, transparent);
    color: var(--latex-muted);
    font-size: 0.76rem;
    line-height: 1.6;
  }

  .merge-note strong {
    display: block;
    color: var(--latex-text);
  }

  .notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.8rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--latex-rule);
    border-left: 4px solid var(--latex-text);
  }

  .notice[data-tone="error"] {
    border-left-color: var(--latex-accent);
    color: var(--latex-accent);
  }

  .notice p,
  .register-heading p,
  h2 {
    margin: 0;
  }

  .notice p {
    font-size: 0.8rem;
  }

  .notice button {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .register-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.75rem 0;
    border-top: 2px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
  }

  h2 {
    margin-top: 0.2rem;
    font-size: 1.15rem;
    font-weight: 560;
  }

  .attendance-list {
    border-bottom: 2px solid var(--latex-rule);
  }

  .attendance-row {
    display: grid;
    grid-template-columns: 2rem 1.6rem minmax(8rem, 1fr) minmax(8rem, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    min-height: 3.7rem;
    padding: 0.55rem 0.65rem;
    border-bottom: 1px solid color-mix(in srgb, var(--latex-rule) 26%, transparent);
    cursor: pointer;
  }

  .attendance-row:last-child {
    border-bottom: 0;
  }

  .attendance-row.checked {
    background: color-mix(in srgb, var(--latex-text) 4%, transparent);
  }

  .attendance-row input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .row-index,
  .checkin-source,
  code {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.62rem;
  }

  .check-mark {
    display: grid;
    place-items: center;
    width: 1.45rem;
    height: 1.45rem;
    border: 1px solid var(--latex-rule);
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }

  .member-name {
    font-weight: 620;
  }

  .member-department,
  .checkin-source {
    color: var(--latex-muted);
    font-size: 0.74rem;
  }

  .register-actions {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.9rem;
  }

  .share-link {
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
    gap: 0.25rem 0.45rem;
    min-width: 0;
  }

  .share-link > span {
    grid-column: 1 / -1;
  }

  code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-line {
    margin: 0;
    padding: 1rem 0;
    color: var(--latex-muted);
    font-size: 0.8rem;
  }

  @media (max-width: 720px) {
    .attendance-toolbar {
      grid-template-columns: 1fr;
    }

    .session-index {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .session-index div:nth-child(2) {
      border-right: 0;
    }

    .session-index div:nth-child(-n + 2) {
      border-bottom: 1px solid var(--latex-rule);
    }

    .attendance-row {
      grid-template-columns: 1.5rem 1.6rem minmax(0, 1fr) auto;
    }

    .member-department {
      grid-column: 3 / -1;
      margin-top: -0.4rem;
    }

    .checkin-source {
      grid-column: 4;
      grid-row: 1;
    }

    .register-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .share-link,
    .register-actions > button {
      width: 100%;
    }
  }
</style>
