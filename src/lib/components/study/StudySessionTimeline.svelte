<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import { v7 as uuidv7 } from "uuid";
  import CopyButton from "$lib/components/CopyButton.svelte";
  import StudySessionCorrectionDialog from "./StudySessionCorrectionDialog.svelte";
  import type {
    StudyOperationResult,
    StudySessionItem,
  } from "$lib/domain/studies";

  interface Props {
    studyId: string;
    sessions: StudySessionItem[];
    canCreate: boolean;
    onTransition: (result: StudyOperationResult) => void;
    onError: (message: string) => void;
  }

  let { studyId, sessions, canCreate, onTransition, onError }: Props = $props();
  let operationId = $state(uuidv7());
  let creating = $state(false);
  let cancellingSessionId = $state<string | null>(null);
  let selectedSession = $state<StudySessionItem | null>(null);
  let latestCreated = $state<StudySessionItem | null>(null);

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function statusLabel(status: StudySessionItem["status"]) {
    return { active: "출석 진행", expired: "종료", cancelled: "취소" }[status];
  }

  function applyResult(result: StudyOperationResult) {
    if (result.operation === "sessionCreated") {
      latestCreated = result.session;
      operationId = uuidv7();
    }
    if (result.operation === "sessionUpdated") {
      selectedSession = null;
      if (latestCreated?.id === result.sessionId) {
        latestCreated = {
          ...latestCreated,
          title: result.title,
          startedAt: result.startedAt,
        };
      }
    }
    if (
      result.operation === "sessionCancelled" &&
      latestCreated?.id === result.sessionId
    ) {
      latestCreated = null;
    }
    onTransition(result);
  }
</script>

<section class="session-panel" aria-labelledby="sessions-heading">
  <header class="section-heading">
    <div>
      <p>Sessions · Manual Timeline</p>
      <h2 id="sessions-heading">회차와 출석</h2>
    </div>
    <span>{sessions.length}회</span>
  </header>

  <div class="creation-sheet">
    <div>
      <strong>모임을 시작할 때 새 회차를 만드세요.</strong>
      <p>번호와 시작 시각은 서버가 채우고, 출석 링크가 즉시 열립니다. 입력할 값은 없습니다.</p>
    </div>
    <form
      method="POST"
      action="?/createSession"
      use:enhance={() => {
        creating = true;
        return async ({ result }) => {
          creating = false;
          if (result.type === "success") {
            applyResult(result.data as StudyOperationResult);
          } else {
            const data = "data" in result ? result.data as { error?: string } : null;
            onError(data?.error ?? "새 회차를 만들지 못했습니다.");
          }
        };
      }}
    >
      <input type="hidden" name="operationId" value={operationId} />
      <button class="paper-btn primary" disabled={!canCreate || creating}>
        {creating ? "회차 생성 중…" : "새 회차 만들기"}
      </button>
    </form>
  </div>

  {#if latestCreated}
    <aside class="created-sheet" role="status">
      <div>
        <strong>{latestCreated.title} 출석 링크가 열렸습니다.</strong>
        <span>{formatDate(latestCreated.startedAt)} · 출석 진행 중</span>
      </div>
      <div class="created-actions">
        <CopyButton
          text={`${page.url.origin}${latestCreated.attendancePath}`}
          title="출석 링크 복사"
        />
        <a
          class="paper-btn primary small"
          href={`/study/${studyId}/attendance?event=${latestCreated.eventId}`}
        >출석부 열기</a>
      </div>
    </aside>
  {/if}

  <ol class="session-timeline">
    {#each sessions as session (session.id)}
      <li class="session-entry" data-status={session.status}>
        <div class="session-number">{String(session.sessionNo).padStart(2, "0")}</div>
        <article>
          <header class="session-heading">
            <div>
              <h3>{session.title}</h3>
              <p>{formatDate(session.startedAt)} · KST</p>
            </div>
            <span class="status-mark">{statusLabel(session.status)}</span>
          </header>
          <dl>
            <div><dt>출석</dt><dd>{session.attendanceCount}명</dd></div>
            <div><dt>Event</dt><dd>{session.eventId}</dd></div>
          </dl>
          <div class="session-actions">
            {#if session.status !== "cancelled"}
              <CopyButton
                text={`${page.url.origin}${session.attendancePath}`}
                title={`${session.title} 출석 링크 복사`}
              />
              <a
                class="paper-btn small"
                href={`/study/${studyId}/attendance?event=${session.eventId}`}
              >출석부</a>
            {/if}
            {#if session.canEdit}
              <button class="paper-btn small" onclick={() => (selectedSession = session)}>정정</button>
            {/if}
            {#if session.canCancel}
              <form
                method="POST"
                action="?/cancelSession"
                use:enhance={() => {
                  cancellingSessionId = session.id;
                  return async ({ result }) => {
                    cancellingSessionId = null;
                    if (result.type === "success") {
                      applyResult(result.data as StudyOperationResult);
                    } else {
                      const data = "data" in result ? result.data as { error?: string } : null;
                      onError(data?.error ?? "회차를 취소하지 못했습니다.");
                    }
                  };
                }}
              >
                <input type="hidden" name="sessionId" value={session.id} />
                <button
                  class="paper-btn danger small"
                  disabled={cancellingSessionId === session.id}
                  onclick={(event) => {
                    if (!confirm(`${session.title}를 취소하시겠습니까? 취소한 회차는 다시 열 수 없습니다.`)) {
                      event.preventDefault();
                    }
                  }}
                >취소</button>
              </form>
            {/if}
          </div>
        </article>
      </li>
    {:else}
      <li class="empty-line">아직 생성된 회차가 없습니다.</li>
    {/each}
  </ol>
</section>

{#if selectedSession}
  {#key selectedSession.id}
    <StudySessionCorrectionDialog
      session={selectedSession}
      onSaved={applyResult}
      onClose={() => (selectedSession = null)}
    />
  {/key}
{/if}

<style>
  .session-panel {
    min-width: 0;
    border: 1px solid var(--latex-rule);
  }

  .section-heading,
  .creation-sheet,
  .created-sheet,
  .session-heading,
  .session-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .section-heading {
    padding: 0.85rem 1rem;
    border-bottom: 2px solid var(--latex-rule);
  }

  .section-heading p {
    margin: 0 0 0.2rem;
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2,
  h3,
  p,
  dl,
  dd {
    margin: 0;
  }

  h2 {
    font-size: 1.2rem;
    font-weight: 560;
  }

  .section-heading > span {
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--latex-rule);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
  }

  .creation-sheet {
    align-items: end;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--latex-rule);
    background: color-mix(in srgb, var(--latex-text) 3%, transparent);
  }

  .creation-sheet strong,
  .created-sheet strong {
    font-size: 0.88rem;
  }

  .creation-sheet p,
  .created-sheet span {
    display: block;
    margin-top: 0.25rem;
    color: var(--latex-muted);
    font-size: 0.74rem;
    line-height: 1.5;
  }

  .created-sheet {
    margin: 0.8rem;
    padding: 0.75rem;
    border: 1px solid var(--latex-rule);
    border-left: 4px solid var(--latex-accent);
  }

  .created-actions,
  .session-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .session-timeline {
    margin: 0;
    padding: 0.85rem;
    list-style: none;
  }

  .session-entry {
    display: grid;
    grid-template-columns: 2.4rem minmax(0, 1fr);
    gap: 0.7rem;
    position: relative;
  }

  .session-entry:not(:last-child) {
    padding-bottom: 0.8rem;
  }

  .session-entry:not(:last-child)::before {
    content: "";
    position: absolute;
    top: 2.2rem;
    bottom: -0.1rem;
    left: 1.18rem;
    border-left: 1px solid var(--latex-rule);
  }

  .session-number {
    display: grid;
    place-items: center;
    align-self: start;
    aspect-ratio: 1;
    border: 1px solid var(--latex-rule);
    background: var(--latex-bg);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 700;
    z-index: 1;
  }

  .session-entry > article {
    min-width: 0;
    padding: 0.75rem;
    border: 1px solid var(--latex-rule);
  }

  .session-entry[data-status="active"] > article {
    border-top: 3px solid var(--latex-accent);
  }

  .session-entry[data-status="cancelled"] > article {
    opacity: 0.58;
  }

  h3 {
    font-size: 0.95rem;
    font-weight: 600;
  }

  .session-heading p {
    margin-top: 0.18rem;
    color: var(--latex-muted);
    font-size: 0.72rem;
  }

  .status-mark,
  dt {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.57rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    margin-top: 0.65rem;
    padding-top: 0.55rem;
    border-top: 1px solid color-mix(in srgb, var(--latex-rule) 28%, transparent);
  }

  dd {
    overflow: hidden;
    font-family: var(--font-mono);
    font-size: 0.66rem;
    text-overflow: ellipsis;
  }

  .session-actions {
    justify-content: flex-end;
    margin-top: 0.65rem;
  }

  .session-actions form {
    margin: 0;
  }

  :global(.paper-btn.danger) {
    border-color: var(--latex-accent);
    color: var(--latex-accent);
  }

  .empty-line {
    padding: 1rem;
    color: var(--latex-muted);
    font-size: 0.8rem;
  }

  @media (max-width: 680px) {
    .creation-sheet,
    .created-sheet {
      align-items: stretch;
      flex-direction: column;
    }

    .creation-sheet form,
    .creation-sheet button,
    .created-actions,
    .created-actions a {
      width: 100%;
    }
  }

  @media (max-width: 460px) {
    .session-entry {
      grid-template-columns: 2rem minmax(0, 1fr);
      gap: 0.45rem;
    }

    .session-entry:not(:last-child)::before {
      left: 0.98rem;
    }

    dl {
      grid-template-columns: 1fr;
    }
  }
</style>
