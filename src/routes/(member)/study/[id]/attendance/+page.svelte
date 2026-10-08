<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto, invalidateAll } from "$app/navigation";
  import { createAttendanceSubmissionGate } from "$lib/client/attendance-submission";
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import CopyButton from "$lib/components/CopyButton.svelte";
  import {
    attendanceActionError,
    attendanceDateLabel,
    attendanceSessionLabel,
  } from "$lib/domain/attendance";

  let { data, form } = $props();
  const submissions = createAttendanceSubmissionGate();
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
    untrack(() => attendees.filter((m) => m.attended).map((m) => m.id)),
  );
  let syncedEventId = $state(untrack(() => selectedSession?.eventId ?? null));
  let savingEventId = $state<string | null>(null);
  const processing = $derived(
    savingEventId !== null && savingEventId === selectedSession?.eventId,
  );
  let notice = $state<{ tone: "success" | "error"; message: string } | null>(
    null,
  );
  const selectedCount = $derived(selectedIds.size);
  const allSelected = $derived(
    attendees.length > 0 && selectedIds.size === attendees.length,
  );
  const dirty = $derived(
    attendees.some((m) => selectedIds.has(m.id) !== m.attended),
  );
  const visibleNotice = $derived(
    notice ??
      (form?.success && form?.eventId === selectedSession?.eventId
        ? {
            tone: "success",
            message:
              "이 회차의 출석부를 저장했습니다. 관리 범위 밖의 기존 출석은 보존했습니다.",
          }
        : form?.error
          ? {
              tone: "error",
              message: attendanceActionError(form.error, "sheet"),
            }
          : null),
  );
  const savePath = $derived(
    selectedSession
      ? `?event=${encodeURIComponent(selectedSession.eventId)}&/saveAttendance`
      : "?/saveAttendance",
  );

  $effect(() => {
    const eventId = selectedSession?.eventId ?? null;
    if (eventId === syncedEventId) return;
    submissions.invalidate();
    savingEventId = null;
    syncedEventId = eventId;
    replaceSelected(attendees.filter((m) => m.attended).map((m) => m.id));
    notice = null;
  });
  function replaceSelected(ids: Iterable<string>) {
    selectedIds.clear();
    for (const id of ids) selectedIds.add(id);
  }
  function setSelected(id: string, checked: boolean) {
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
  }
  function toggleAll() {
    if (allSelected) selectedIds.clear();
    else replaceSelected(attendees.map((m) => m.id));
  }
  function resetSelection() {
    replaceSelected(attendees.filter((m) => m.attended).map((m) => m.id));
  }
  async function switchSession(event: Event) {
    const selector = event.currentTarget as HTMLSelectElement;
    if (
      processing ||
      (dirty &&
        !confirm(
          "저장하지 않은 출석 선택이 있습니다. 변경을 버리고 다른 회차를 확인할까요?",
        ))
    ) {
      selector.value = selectedSession?.eventId ?? "";
      return;
    }
    const next = new URL(page.url);
    next.searchParams.set("event", selector.value);
    await goto(`${next.pathname}${next.search}`, { noScroll: true });
  }
</script>

<svelte:head><title>{data.studyTitle} 출석부 · SNUMPS</title></svelte:head>

<article class="paper-document attendance-register">
  <header class="attendance-heading">
    <a href={`/study/${data.studyId}/manage`}>← 스터디 관리</a>
    <h1>{data.studyTitle} 출석부</h1>
    <p>회차를 고르고, 실제 참여한 회원의 출석 기록을 확인·정정합니다.</p>
  </header>

  {#if selectedSession}
    <section class="session-section" aria-labelledby="session-heading">
      <p class="section-number">§ 01 · 회차 확인</p>
      <h2 id="session-heading">출석을 확인할 회차</h2>
      <label for="session-selector">회차 선택</label>
      <select
        id="session-selector"
        value={selectedSession.eventId}
        onchange={switchSession}
        disabled={processing}
      >
        {#each sessions as session (session.eventId)}<option
            value={session.eventId}
            >{session.title} · {attendanceDateLabel(session.date)}</option
          >{/each}
      </select>
      <dl class="session-facts">
        <div>
          <dt>일시 · KST</dt>
          <dd>{attendanceDateLabel(selectedSession.date)}</dd>
        </div>
        <div>
          <dt>접수 상태</dt>
          <dd>{attendanceSessionLabel(selectedSession.status)}</dd>
        </div>
      </dl>
      {#if selectedSession.status === "active"}
        <div class="share-link">
          <div>
            <strong>참여자용 출석 링크</strong>
            <p>회원이 요청하면 운영진 승인 후 활동 이력에 반영됩니다.</p>
          </div>
          <CopyButton
            text={`${page.url.origin}${selectedSession.attendPath}`}
            title="출석 링크 복사"
          />
        </div>
      {:else}<p class="closed-request-note">
          새 출석 요청은 받지 않지만, 아래 출석 기록은 정정할 수 있습니다.
        </p>{/if}
    </section>

    <section class="roster-section" aria-labelledby="roster-heading">
      <p class="section-number">§ 02 · 출석 기록</p>
      <h2 id="roster-heading">참여자별 출석 확인</h2>
      <p class="merge-note">
        이 화면은 주최자가 출석 기록을 직접 정정하는 곳입니다. 출석 요청 큐의
        승인과는 별도이며, 명부 밖의 기존 출석 기록은 보존합니다. 스터디가
        종료되거나 접수가 만료된 뒤에도 정정할 수 있습니다.
      </p>
      {#if !data.canSave}<p class="read-only-note">
          이번 학기 등록 전에는 출석부를 열람만 할 수 있습니다.
        </p>{/if}
      {#if visibleNotice}<p
          class="notice"
          data-tone={visibleNotice.tone}
          role={visibleNotice.tone === "error" ? "alert" : "status"}
        >
          {visibleNotice.message}
        </p>{/if}
      <form
        method="POST"
        action={savePath}
        use:enhance={({ formData, cancel }) => {
          const submittedEventId = String(formData.get("eventId") ?? "");
          if (processing || !data.canSave || !submittedEventId) {
            cancel();
            return;
          }
          const ticket = submissions.begin(submittedEventId);
          const ownsResponse = () =>
            submissions.current(ticket, selectedSession?.eventId ?? "");
          savingEventId = submittedEventId;
          notice = null;
          return async ({ result, update }) => {
            try {
              if (!ownsResponse()) return;
              if (result.type === "redirect") {
                await update({ reset: false });
                return;
              }
              if (result.type === "success") {
                await invalidateAll();
                if (!ownsResponse()) return;
                resetSelection();
                notice = {
                  tone: "success",
                  message: `${attendees.filter((m) => m.attended).length}명의 출석 기록을 저장했습니다. 명부 밖의 기존 출석은 보존했습니다.`,
                };
                return;
              }
              const payload =
                "data" in result
                  ? (result.data as { error?: string; message?: string })
                  : null;
              const code =
                payload?.error ??
                (result.type === "error"
                  ? (
                      {
                        401: "UNAUTHORIZED",
                        403: "FORBIDDEN",
                        404: "NOT_FOUND",
                        503: "SERVICE_UNAVAILABLE",
                      } as Record<number, string>
                    )[result.status ?? 500]
                  : undefined);
              notice = {
                tone: "error",
                message:
                  payload?.message ?? attendanceActionError(code, "sheet"),
              };
            } catch {
              notice = {
                tone: "error",
                message:
                  "처리 결과를 새로 불러오지 못했습니다. 저장되었을 수 있으니 새로고침해 출석부를 확인해 주세요.",
              };
            } finally {
              if (ownsResponse() && savingEventId === submittedEventId)
                savingEventId = null;
            }
          };
        }}
      >
        <input type="hidden" name="eventId" value={selectedSession.eventId} />
        <div class="roster-toolbar">
          <span>{attendees.length}명 중 {selectedCount}명 선택</span><button
            type="button"
            class="paper-btn small"
            onclick={toggleAll}
            disabled={processing || !data.canSave || attendees.length === 0}
            >{allSelected ? "전체 해제" : "전체 선택"}</button
          >
        </div>
        <div class="attendance-list">
          {#each attendees as member (member.id)}
            <label
              class="attendance-row"
              class:checked={selectedIds.has(member.id)}
            >
              <input
                type="checkbox"
                name="attendeeIds"
                value={member.id}
                checked={selectedIds.has(member.id)}
                disabled={processing || !data.canSave}
                onchange={(e) =>
                  setSelected(member.id, e.currentTarget.checked)}
              />
              <span class="member-label"
                ><strong>{member.name}</strong><span>{member.department}</span
                ></span
              >
              <span class="saved-state"
                >{member.attended ? "저장된 출석" : "출석 기록 없음"}</span
              >
            </label>
          {:else}<p class="empty-line">참여자 명부가 비어 있습니다.</p>{/each}
        </div>
        <div class="save-section">
          <div>
            <p class="section-number">§ 03 · 저장</p>
            <p>
              {dirty
                ? "선택한 변경은 저장한 뒤 반영됩니다."
                : "저장된 출석 기록과 같은 선택입니다."}
            </p>
          </div>
          <div class="save-actions">
            <button
              type="button"
              class="paper-btn secondary"
              onclick={resetSelection}
              disabled={processing || !data.canSave || !dirty}>변경 취소</button
            ><button
              class="paper-btn primary"
              disabled={processing || !data.canSave || attendees.length === 0}
              aria-busy={processing}
              >{processing
                ? "출석부 저장 중…"
                : `${selectedCount}명 출석으로 저장`}</button
            >
          </div>
        </div>
      </form>
    </section>
  {:else}<section class="empty-state">
      <h2>아직 생성된 회차가 없습니다</h2>
      <p>스터디 관리에서 회차를 연 뒤 출석을 기록할 수 있습니다.</p>
      <a href={`/study/${data.studyId}/manage`} class="paper-btn secondary"
        >스터디 관리로 이동</a
      >
    </section>{/if}
</article>

<style>
  .attendance-register {
    width: min(100%, 980px);
    font-family: var(--font-ui);
  }
  .attendance-heading {
    border-top: 2px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
    padding: 1rem 0 1.2rem;
    margin-bottom: 1.5rem;
  }
  .attendance-heading a {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    color: var(--latex-muted);
    font-size: 0.8rem;
    text-underline-offset: 0.2em;
  }
  h1 {
    margin: 0.35rem 0 0;
    font: 550 clamp(1.65rem, 3.5vw, 2.1rem)/1.4 var(--font-display);
    overflow-wrap: anywhere;
  }
  .attendance-heading p {
    margin: 0.7rem 0 0;
    color: var(--latex-muted);
    font-size: 0.88rem;
    line-height: 1.75;
  }
  .section-number {
    margin: 0 0 0.35rem;
    color: var(--latex-muted);
    font-size: 0.73rem;
    font-weight: 650;
    letter-spacing: 0.04em;
  }
  h2 {
    margin: 0 0 0.85rem;
    font: 550 1.35rem/1.5 var(--font-display);
  }
  .session-section label {
    color: var(--latex-muted);
    font-size: 0.76rem;
  }
  select {
    width: 100%;
    min-height: 44px;
    border: 1px solid var(--latex-rule);
    background: var(--latex-surface);
    color: var(--latex-text);
    padding: 0.6rem 0.75rem;
    margin: 0.35rem 0 0.75rem;
    font: 0.85rem/1.5 var(--font-ui);
  }
  .session-facts {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 1rem;
    margin: 0.4rem 0 1rem;
  }
  .session-facts div {
    display: grid;
    gap: 0.3rem;
  }
  dt {
    color: var(--latex-muted);
    font-size: 0.74rem;
  }
  dd {
    margin: 0;
    font-size: 0.87rem;
  }
  .share-link {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
    padding: 0.8rem 0.95rem;
    background: var(--latex-surface);
    border-left: 2px solid var(--latex-rule);
  }
  .share-link strong {
    font-size: 0.86rem;
  }
  .share-link p,
  .closed-request-note {
    margin: 0.35rem 0 0;
    color: var(--latex-muted);
    font-size: 0.8rem;
    line-height: 1.7;
  }
  .roster-section {
    margin-top: 1.7rem;
    border-top: 1px solid var(--latex-rule);
    padding-top: 1.2rem;
  }
  .merge-note {
    margin: 0 0 1rem;
    color: var(--latex-muted);
    font-size: 0.83rem;
    line-height: 1.8;
  }
  .read-only-note {
    padding: 0.7rem 0.85rem;
    background: var(--latex-surface);
    color: var(--latex-muted);
    font-size: 0.83rem;
  }
  .notice {
    padding: 0.7rem 0.85rem;
    border-left: 3px solid var(--latex-text);
    font-size: 0.85rem;
    line-height: 1.7;
  }
  .notice[data-tone="error"] {
    border-left-color: var(--latex-accent);
    color: var(--latex-accent);
  }
  .roster-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
    margin: 0.8rem 0;
  }
  .roster-toolbar > span {
    color: var(--latex-muted);
    font-size: 0.8rem;
  }
  .attendance-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 0.7rem;
    align-items: center;
    min-height: 64px;
    padding: 0.65rem 0.8rem;
    border-top: 1px solid var(--latex-rule);
    cursor: pointer;
  }
  .attendance-row:last-child {
    border-bottom: 1px solid var(--latex-rule);
  }
  .attendance-row.checked {
    background: var(--latex-surface);
  }
  .attendance-row input {
    width: 20px;
    height: 20px;
    accent-color: var(--latex-text);
  }
  .attendance-row:focus-within {
    outline: 2px solid var(--latex-accent);
    outline-offset: -2px;
  }
  .member-label {
    display: grid;
    gap: 0.3rem;
  }
  .member-label strong {
    font-size: 0.87rem;
  }
  .member-label > span,
  .saved-state {
    color: var(--latex-muted);
    font-size: 0.75rem;
  }
  .save-section {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: end;
    margin-top: 1.4rem;
  }
  .save-section p:not(.section-number) {
    margin: 0.4rem 0 0;
    color: var(--latex-muted);
    font-size: 0.8rem;
  }
  .save-actions {
    display: flex;
    gap: 0.5rem;
  }
  .empty-line,
  .empty-state p {
    color: var(--latex-muted);
    font-size: 0.85rem;
    line-height: 1.75;
  }
  @media (max-width: 640px) {
    .session-facts {
      grid-template-columns: 1fr;
    }
    .attendance-row {
      grid-template-columns: 24px minmax(0, 1fr);
    }
    .saved-state {
      grid-column: 2;
    }
    .save-section {
      flex-direction: column;
      align-items: stretch;
    }
    .save-actions {
      flex-direction: column-reverse;
    }
  }
</style>
