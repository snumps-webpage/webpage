<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { tick, untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import type { SubmitFunction } from "@sveltejs/kit";
  import { createAttendanceSubmissionGate } from "$lib/client/attendance-submission";
  import CopyButton from "$lib/components/CopyButton.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import {
    attendanceDateLabel,
    attendanceSessionLabel,
  } from "$lib/domain/attendance";
  import {
    presenterFeedback,
    presenterInitialSelection,
    presenterRequestStatus,
    reconcilePresenterSelection,
    type PresenterActionState,
    type PresenterApplicantState,
  } from "$lib/domain/presenter-attendance";

  let { data, form } = $props();
  const submissions = createAttendanceSubmissionGate();
  const management = $derived(
    data.managedSeminars.find(
      (seminar) => seminar.id === page.url.searchParams.get("event"),
    ) ??
      data.managedSeminars[0] ??
      null,
  );
  const scopeKey = $derived(
    `${page.url.pathname}?event=${page.url.searchParams.get("event") ?? ""}`,
  );
  const actionForm = $derived(form as PresenterActionState | null);
  const initial = untrack(() => management);
  const selectedIds = new SvelteSet(
    untrack(() =>
      initial
        ? presenterInitialSelection(initial.id, initial.applicants, actionForm)
        : [],
    ),
  );
  const savedApplicantIds = new SvelteSet(
    initial?.applicants.filter((m) => m.checked).map((m) => m.id) ?? [],
  );
  let syncedEventId = $state(initial?.id ?? "");
  let syncedScope = $state(untrack(() => scopeKey));
  let rosterSnapshot = $state.raw<PresenterApplicantState[]>(
    initial?.applicants.map(({ id, checked }) => ({ id, checked })) ?? [],
  );
  let pending = $state<{
    operation: "presenterAttendanceSaved" | "seminarCancelled";
    eventId: string;
  } | null>(null);
  const processing = $derived(pending !== null);
  let notice = $state<ReturnType<typeof presenterFeedback>>(null);
  let dismissedForm = $state<PresenterActionState | null>(null);
  const nativeNotice = $derived(
    actionForm !== dismissedForm &&
      (actionForm?.operation === "seminarCancelled" ||
        actionForm?.eventId === management?.id)
      ? presenterFeedback(actionForm)
      : null,
  );
  const visibleNotice = $derived(processing ? null : (notice ?? nativeNotice));
  const selectedCount = $derived(selectedIds.size);
  const allSelected = $derived(
    !!management?.applicants.length &&
      management.applicants.every((m) => selectedIds.has(m.id)),
  );
  const dirty = $derived(
    !!management &&
      management.applicants.some(
        (m) => selectedIds.has(m.id) !== savedApplicantIds.has(m.id),
      ),
  );
  const savePath = $derived(
    management
      ? `?event=${encodeURIComponent(management.id)}&/saveAttendance`
      : "?/saveAttendance",
  );
  const cancelPath = $derived(
    management
      ? `?event=${encodeURIComponent(management.id)}&/cancelSeminar`
      : "?/cancelSeminar",
  );

  $effect(() => {
    const current = management;
    const key = scopeKey;
    untrack(() => {
      if (key !== syncedScope) {
        syncedScope = key;
        submissions.invalidate();
        pending = null;
        notice = null;
        dismissedForm = actionForm;
      }
      const next =
        current?.applicants.map(({ id, checked }) => ({ id, checked })) ?? [];
      replaceSelected(
        current?.id !== syncedEventId
          ? next.filter((m) => m.checked).map((m) => m.id)
          : reconcilePresenterSelection(rosterSnapshot, next, selectedIds),
      );
      syncedEventId = current?.id ?? "";
      rosterSnapshot = next;
      replaceSaved(next.filter((m) => m.checked).map((m) => m.id));
    });
  });

  function replaceSelected(ids: Iterable<string>) {
    selectedIds.clear();
    for (const id of ids) selectedIds.add(id);
  }
  function replaceSaved(ids: Iterable<string>) {
    savedApplicantIds.clear();
    for (const id of ids) savedApplicantIds.add(id);
  }
  function setSelected(id: string, checked: boolean) {
    if (processing || !data.canSave) return;
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
  }
  function toggleAll() {
    if (processing || !data.canSave || !management) return;
    if (allSelected) selectedIds.clear();
    else replaceSelected(management.applicants.map((m) => m.id));
  }
  function resetSelection() {
    if (processing || !data.canSave) return;
    replaceSelected(savedApplicantIds);
  }
  async function switchEvent(event: SubmitEvent) {
    event.preventDefault();
    const selector = (
      event.currentTarget as HTMLFormElement
    ).querySelector<HTMLSelectElement>("select")!;
    if (
      processing ||
      (dirty &&
        !confirm(
          "저장하지 않은 출석 선택이 있습니다. 변경을 버리고 다른 세미나를 확인할까요?",
        ))
    ) {
      selector.value = management?.id ?? "";
      return;
    }
    // A local navigation target, not retained reactive state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new URL(page.url);
    next.search = "";
    next.searchParams.set("event", selector.value);
    await goto(`${next.pathname}${next.search}`, { noScroll: true });
  }
  function dismissNotice() {
    notice = null;
    dismissedForm = actionForm;
  }
  function operationEnhancer(
    operation: "presenterAttendanceSaved" | "seminarCancelled",
  ): SubmitFunction {
    return ({ cancel, formElement }) => {
      if (processing || !data.canSave || !management) {
        cancel();
        return;
      }
      const eventId = management.id;
      const ticket = submissions.begin(scopeKey);
      const ownsResponse = () =>
        submissions.current(ticket, scopeKey) &&
        (operation === "seminarCancelled" || management?.id === eventId);
      const article = formElement.closest("article");
      pending = { operation, eventId };
      notice = null;
      return async ({ result, update }) => {
        try {
          if (!ownsResponse()) return;
          if (result.type === "redirect") {
            await update({ reset: false });
            return;
          }
          if (result.type === "success") {
            if (operation === "presenterAttendanceSaved") {
              await invalidateAll();
              if (!ownsResponse()) return;
              replaceSelected(
                management?.applicants
                  .filter((m) => m.checked)
                  .map((m) => m.id) ?? [],
              );
              await update({ reset: false, invalidateAll: false });
            } else {
              await update({ reset: false });
            }
            if (!ownsResponse()) return;
            const payload = result.data as PresenterActionState;
            notice = presenterFeedback({ ...payload, operation });
          } else if (result.type === "failure") {
            await update({ reset: false, invalidateAll: false });
            if (!ownsResponse()) return;
            notice = presenterFeedback({
              ...(result.data as PresenterActionState),
              operation,
            });
          } else {
            notice = {
              tone: "warning",
              message:
                "처리 결과를 확인하지 못했습니다. 저장되었을 수 있으니 현재 목록을 다시 불러와 확인해 주세요.",
            };
          }
        } catch {
          if (ownsResponse())
            notice = {
              tone: "warning",
              message:
                "처리 후 최신 목록을 불러오지 못했습니다. 저장되었을 수 있으니 새로고침해 기록을 확인해 주세요.",
            };
        } finally {
          if (submissions.current(ticket, scopeKey)) pending = null;
        }
        if (ownsResponse()) {
          await tick();
          article?.querySelector<HTMLElement>(".notice")?.focus();
        }
      };
    };
  }
</script>

<svelte:head
  ><title>발표자 출석 관리 · SNUMPS</title><meta
    name="robots"
    content="noindex"
  /></svelte:head
>

<article class="paper-document presenter-register">
  <ManuscriptHeader
    title="세미나 출석 관리"
    subtitle="Presenter Attendance Register"
    figure={MANUSCRIPT.FIGURES.PRESENTER_ATTENDANCE}
  />
  <p class="page-intro">
    담당 세미나를 고르고, 참가 신청자의 실제 출석을 확인·정정합니다.
  </p>
  {#if visibleNotice}
    <div
      class="notice"
      data-tone={visibleNotice.tone}
      role={visibleNotice.tone === "error" ? "alert" : "status"}
      tabindex="-1"
    >
      <p>{visibleNotice.message}</p>
      <button type="button" aria-label="알림 닫기" onclick={dismissNotice}
        >×</button
      >
    </div>
  {/if}
  {#if !management}
    <section class="empty-sheet" aria-labelledby="empty-heading">
      <p class="section-index">No Assigned Events</p>
      <h2 id="empty-heading">발표자로 배정된 공개 세미나가 없습니다.</h2>
      <p>
        세미나가 승인·일정 공개된 뒤 본인이 발표자로 등록되면 이곳에서 신청자
        출석과 공유 링크를 관리할 수 있습니다.
      </p>
      <div class="empty-actions">
        <a class="paper-btn" href="/">회원 홈</a>{#if data.canSave}<a
            class="paper-btn primary"
            href="/seminar/apply">세미나 신청</a
          >{/if}
      </div>
    </section>
  {:else}
    <form
      class="event-toolbar"
      method="GET"
      action="/events/manage"
      onsubmit={switchEvent}
    >
      <label for="event-selector">관리할 세미나</label>
      <select
        id="event-selector"
        name="event"
        value={management.id}
        disabled={processing}
      >
        {#each data.managedSeminars as event (event.id)}<option value={event.id}
            >{event.title} · {attendanceSessionLabel(event.status)}</option
          >{/each}
      </select>
      <button type="submit" class="paper-btn small" disabled={processing}
        >출석부 열기</button
      >
    </form>
    <section class="event-index" aria-label="선택한 세미나">
      <div class="title-cell">
        <span>Seminar</span><strong>{management.title}</strong>
      </div>
      <div>
        <span>접수 상태</span><strong
          >{attendanceSessionLabel(management.status)}</strong
        >
      </div>
      <div>
        <span>저장된 신청자 출석</span><strong
          >{savedApplicantIds.size} / {management.applicants.length}</strong
        >
      </div>
    </section>
    <section class="schedule-line" aria-label="세미나 일시">
      <div>
        <span>일시 · KST</span><strong
          >{attendanceDateLabel(management.date)}</strong
        >
      </div>
    </section>
    {#if management.seminarId && !management.canCancel}<p class="cancel-note">
        이미 시작된 세미나는 개설자가 취소할 수 없습니다. 취소가 필요하면
        운영진에게 요청해 주세요.
      </p>{/if}
    {#if !data.canSave}<p class="read-only-note">
        이번 학기 등록 전에는 출석부를 열람만 할 수 있습니다.
      </p>{/if}
    <section aria-labelledby="roster-heading" class="roster-section">
      <div class="register-heading">
        <div>
          <p>Applicant Register</p>
          <h2 id="roster-heading">신청자별 출석 확인</h2>
        </div>
        <span class="draft-mark"
          >{dirty ? "저장하지 않은 선택" : "저장된 기록과 같음"}</span
        >
      </div>
      <aside class="merge-note" id="merge-scope">
        <strong>기록 정정</strong>체크는 신청자 명부의 활동 출석을 직접
        수정합니다. 출석 요청의 승인·거절은 운영진이 별도로 처리합니다. 명부
        밖의 기존 출석 {management.nonApplicantAttendanceCount}명은 보존하며,
        접수 종료 후에도 정정할 수 있습니다.
      </aside>
      <form
        method="POST"
        action={savePath}
        aria-describedby="merge-scope"
        aria-busy={pending?.operation === "presenterAttendanceSaved"}
        use:enhance={operationEnhancer("presenterAttendanceSaved")}
      >
        <input type="hidden" name="eventId" value={management.id} />
        <div class="roster-toolbar">
          <span>{management.applicants.length}명 중 {selectedCount}명 선택</span
          >
          <div>
            <button
              type="button"
              class="paper-btn small"
              onclick={toggleAll}
              disabled={processing ||
                !data.canSave ||
                !management.applicants.length}
              >{allSelected ? "전체 해제" : "전체 선택"}</button
            ><button
              type="button"
              class="paper-btn small"
              onclick={resetSelection}
              disabled={processing || !data.canSave || !dirty}
              >저장된 선택으로</button
            >
          </div>
        </div>
        <fieldset
          class="roster-fields"
          aria-labelledby="roster-heading"
          disabled={processing || !data.canSave}
        >
          <div class="attendance-list">
            {#each management.applicants as member, index (member.id)}
              <label
                class="attendance-row"
                class:checked={selectedIds.has(member.id)}
              >
                <span class="row-index"
                  >{String(index + 1).padStart(2, "0")}</span
                >
                <input
                  type="checkbox"
                  name="attendeeIds"
                  value={member.id}
                  checked={selectedIds.has(member.id)}
                  disabled={processing || !data.canSave}
                  onchange={(event) =>
                    setSelected(member.id, event.currentTarget.checked)}
                />
                <span class="member-label"
                  ><strong
                    >{member.name === "Unknown"
                      ? "이름 확인 필요"
                      : member.name}</strong
                  ><span>{member.department}</span></span
                >
                <span class="saved-state"
                  >{savedApplicantIds.has(member.id)
                    ? "저장된 출석"
                    : "출석 기록 없음"}</span
                >
                <span
                  class="checkin-source"
                  title={member.checkedInAt
                    ? attendanceDateLabel(member.checkedInAt)
                    : undefined}
                  >{member.checkedInAt
                    ? presenterRequestStatus(member.checkInStatus)
                    : "링크 요청 없음"}</span
                >
              </label>
            {:else}<p class="empty-row">
                참가 신청자가 없습니다. 명부 밖의 기존 출석 기록은 그대로
                보존됩니다.
              </p>{/each}
          </div>
        </fieldset>
        <div class="save-actions">
          <p>
            {dirty
              ? "선택 변경은 출석 저장을 눌러야 반영됩니다."
              : "현재 선택은 저장된 출석 기록과 같습니다."}
          </p>
          <button
            type="submit"
            class="paper-btn primary"
            disabled={processing || !data.canSave}
            >{pending?.operation === "presenterAttendanceSaved"
              ? "출석 저장 중…"
              : `${selectedCount}명 출석 저장`}</button
          >
        </div>
      </form>
    </section>
    <section class="share-link" aria-labelledby="share-heading">
      <div>
        <h2 id="share-heading">참여자용 출석 링크</h2>
        {#if management.status === "active"}<p>
            회원의 링크 요청은 운영진 승인 후 활동 이력에 반영됩니다.
          </p>
          <code>{management.attendPath}</code>{:else}<p>
            새 출석 요청은 받지 않습니다. 위에서 기존 기록을 정정할 수 있습니다.
          </p>{/if}
      </div>
      {#if management.status === "active"}<div class="share-actions">
          <CopyButton
            text={`${page.url.origin}${management.attendPath}`}
            title="출석 링크 복사"
          /><a
            class="paper-btn small"
            href={management.attendPath}
            target="_blank"
            rel="noopener noreferrer">출석 링크 열기</a
          >
        </div>{/if}
    </section>
    {#if data.canSave && management.canCancel && management.seminarId}
      <details class="cancel-confirmation">
        <summary>세미나 취소 안내와 실행</summary>
        <p>
          시작 전에는 이 세미나를 취소할 수 있습니다. 공개·참가 신청 목록에서
          숨겨지며 기존 기록은 보존됩니다. 이 화면에서 취소를 되돌릴 수
          없습니다. 저장하지 않은 출석 선택은 반영하지 않습니다.
        </p>
        <form
          method="POST"
          action={cancelPath}
          aria-busy={pending?.operation === "seminarCancelled"}
          use:enhance={operationEnhancer("seminarCancelled")}
        >
          <input
            type="hidden"
            name="seminarId"
            value={management.seminarId}
          /><button type="submit" class="paper-btn danger" disabled={processing}
            >{pending?.operation === "seminarCancelled"
              ? "세미나 취소 중…"
              : "확인 후 세미나 취소"}</button
          >
        </form>
      </details>
    {/if}
  {/if}
</article>

<style>
  .presenter-register {
    width: min(100%, 980px);
  }
  .event-toolbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 0.85rem;
  }
  .event-toolbar label,
  .event-index span,
  .schedule-line span,
  .register-heading p,
  .section-index {
    color: var(--latex-muted);
    font: 700 0.58rem/1.2 var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  select {
    width: 100%;
    min-height: 2.65rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--latex-rule);
    background: var(--latex-bg);
    color: var(--latex-text);
  }
  .event-index {
    display: grid;
    grid-template-columns: 2fr 0.7fr 0.7fr;
    border: 1px solid var(--latex-rule);
  }
  .event-index > div,
  .schedule-line > div {
    min-width: 0;
    display: grid;
    gap: 0.18rem;
    padding: 0.65rem 0.75rem;
    border-right: 1px solid var(--latex-rule);
  }
  .event-index > div:last-child,
  .schedule-line > div:last-child {
    border-right: 0;
  }
  .event-index strong,
  .schedule-line strong {
    overflow-wrap: anywhere;
    font-size: 0.78rem;
    font-weight: 560;
  }
  .schedule-line {
    display: grid;
    grid-template-columns: 1fr;
    border: 1px solid var(--latex-rule);
    border-top: 0;
  }
  .cancel-note {
    margin: 0;
    padding-left: 0.55rem;
    border-left: 2px solid var(--latex-rule);
    color: var(--latex-muted);
    font-size: 0.75rem;
    line-height: 1.55;
  }

  .merge-note {
    margin: 0.8rem 0;
    padding: 0.7rem 0.8rem;
    border-left: 3px solid var(--latex-accent);
    background: color-mix(in srgb, var(--latex-accent) 4%, transparent);
    color: var(--latex-muted);
    font-size: 0.75rem;
    line-height: 1.6;
  }
  .merge-note strong {
    color: var(--latex-text);
    margin-right: 0.4rem;
  }
  .notice {
    display: flex;
    justify-content: space-between;
    gap: 0.8rem;
    margin-bottom: 0.75rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--latex-rule);
    border-left: 4px solid var(--latex-text);
    font-size: 0.76rem;
  }
  .notice[data-tone="error"] {
    border-left-color: var(--color-danger-text);
    color: var(--color-danger-text);
  }
  .notice p {
    margin: 0;
  }
  .notice button {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  form {
    border: 1px solid var(--latex-rule);
  }
  .register-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.7rem 0.8rem;
    border-bottom: 2px solid var(--latex-rule);
  }
  .register-heading p,
  .register-heading h2 {
    margin: 0;
  }
  .register-heading h2 {
    margin-top: 0.15rem;
    font-size: 1.05rem;
    font-weight: 560;
  }
  .attendance-list {
    padding: 0.45rem;
  }
  .attendance-row {
    display: grid;
    grid-template-columns:
      2rem 1.2rem minmax(8rem, 1fr) minmax(7rem, auto)
      minmax(6rem, auto);
    gap: 0.65rem;
    align-items: center;
    min-height: 3.5rem;
    padding: 0.5rem 0.45rem;
    border-bottom: 1px solid var(--latex-rule);
    cursor: pointer;
  }
  .attendance-row:last-child {
    border-bottom: 0;
  }
  .attendance-row.checked {
    background: color-mix(in srgb, var(--latex-text) 4%, transparent);
  }
  .attendance-row input {
    width: 1rem;
    height: 1rem;
    margin: 0;
    accent-color: var(--latex-text);
  }
  .attendance-row input:focus-visible {
    outline: 2px solid var(--latex-text);
    outline-offset: 3px;
  }
  .row-index,
  .checkin-source,
  .saved-state {
    color: var(--latex-muted);
    font: 0.62rem/1.5 var(--font-mono);
  }
  .member-label {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }
  .member-label strong,
  .member-label > span {
    overflow-wrap: anywhere;
  }
  .member-label strong {
    font-size: 0.8rem;
    font-weight: 650;
  }
  .member-label > span {
    color: var(--latex-muted);
    font-size: 0.72rem;
  }
  .checkin-source {
    justify-self: end;
  }
  .empty-row {
    margin: 0;
    padding: 1rem;
    color: var(--latex-muted);
    text-align: center;
    font-size: 0.75rem;
  }
  .page-intro,
  .save-actions p,
  .share-link p,
  .cancel-confirmation p {
    color: var(--latex-muted);
    font-size: 0.78rem;
    line-height: 1.65;
  }
  .page-intro {
    margin: -0.4rem 0 1.4rem;
  }
  .read-only-note {
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--latex-rule);
    font-size: 0.78rem;
  }
  .draft-mark {
    color: var(--latex-muted);
    font: 0.64rem/1.5 var(--font-mono);
  }
  .roster-section {
    margin-top: 1.4rem;
  }
  .roster-fields {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  .roster-toolbar,
  .save-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.8rem;
    border-bottom: 1px solid var(--latex-rule);
  }
  .roster-toolbar > span {
    color: var(--latex-muted);
    font: 0.68rem/1.5 var(--font-mono);
  }
  .roster-toolbar > div {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .save-actions {
    border-top: 2px solid var(--latex-rule);
    border-bottom: 0;
  }
  .save-actions p {
    margin: 0;
  }
  .share-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-top: 1.5rem;
    padding: 1rem 0;
    border-top: 1px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
  }
  .share-link > div {
    min-width: 0;
  }
  .share-link h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 560;
  }
  .share-link p {
    margin: 0.4rem 0;
  }
  .share-link code {
    display: block;
    overflow-wrap: anywhere;
    font-size: 0.68rem;
  }
  .share-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .cancel-confirmation {
    margin-top: 1.5rem;
  }
  .cancel-confirmation summary {
    padding: 0.8rem;
    border: 1px solid var(--latex-rule);
    cursor: pointer;
    user-select: none;
    font-size: 0.8rem;
  }
  .cancel-confirmation form {
    border: 0;
  }
  .cancel-confirmation p {
    margin: 0.8rem 0;
  }
  .notice[data-tone="warning"] {
    color: var(--color-warning-text);
    border-left-color: var(--color-warning-text);
  }
  .notice:focus,
  .cancel-confirmation summary:focus-visible {
    outline: 2px solid var(--latex-text);
    outline-offset: 3px;
  }
  .empty-sheet {
    padding: clamp(1rem, 4vw, 1.5rem);
    border: 1px solid var(--latex-rule);
  }
  .empty-sheet h2 {
    margin: 0.4rem 0;
    font-size: 1.25rem;
    font-weight: 560;
  }
  .empty-sheet > p:last-of-type {
    color: var(--latex-muted);
    font-size: 0.78rem;
    line-height: 1.7;
  }
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  @media (max-width: 700px) {
    .event-toolbar {
      grid-template-columns: 1fr;
    }
    .event-index {
      grid-template-columns: 1fr 1fr;
    }
    .event-index .title-cell {
      grid-column: 1 / -1;
      border-right: 0;
      border-bottom: 1px solid var(--latex-rule);
    }
    .schedule-line {
      grid-template-columns: 1fr;
    }
    .schedule-line > div {
      border-right: 0;
      border-bottom: 1px solid var(--latex-rule);
    }
    .schedule-line > div:last-child {
      border-bottom: 0;
    }
    .attendance-row {
      grid-template-columns: 1.6rem 1.1rem minmax(0, 1fr) auto;
      gap: 0.35rem;
      padding: 0.65rem 0.4rem;
    }
    .member-label {
      grid-column: 3;
    }
    .saved-state {
      grid-column: 3;
      grid-row: 2;
    }
    .checkin-source {
      grid-column: 4;
      grid-row: 1 / span 2;
    }
    .register-heading,
    .roster-toolbar,
    .save-actions,
    .share-link {
      align-items: stretch;
      flex-direction: column;
    }
    .save-actions :global(.paper-btn) {
      width: 100%;
    }
  }
  @media (max-width: 430px) {
    .share-actions {
      justify-content: stretch;
    }
    .share-actions :global(.paper-btn) {
      flex: 1;
      text-align: center;
    }
  }
</style>
