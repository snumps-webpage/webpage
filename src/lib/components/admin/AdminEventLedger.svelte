<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import { ACTIVITY_TYPES } from "$lib/constants";
  import type { AdminEventItem } from "$lib/domain/admin-dashboard";

  interface Props {
    events: AdminEventItem[];
    onTransition: (eventId: string, operation: "activated" | "expired" | "updated" | "deleted", event?: AdminEventItem) => void;
    onError: (message: string) => void;
  }

  let { events, onTransition, onError }: Props = $props();
  let processingId = $state<string | null>(null);
  let editing = $state<AdminEventItem | null>(null);
  let issues = $state<Record<string, string>>({});

  const statusLabel = {
    draft: "준비",
    active: "진행",
    expired: "종료",
    cancelled: "취소",
  } as const;
  function toLocal(value: string | null) { return value?.slice(0, 16) ?? ""; }

  function submit(event: AdminEventItem, operation: "activated" | "expired" | "updated" | "deleted"): SubmitFunction {
    return () => {
      processingId = event.id;
      return async ({ result }) => {
        processingId = null;
        if (result.type === "success") {
          const data = result.data as { event?: AdminEventItem };
          onTransition(event.id, operation, data.event);
          if (operation === "updated") editing = null;
        } else {
          const data = result.type === "failure"
            ? result.data as { error?: string; issues?: Record<string, string> }
            : null;
          issues = data?.issues ?? {};
          onError(data?.error ?? "이벤트를 처리하지 못했습니다.");
        }
      };
    };
  }

  async function copyPath(path: string) {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
  }
</script>

<section class="admin-section" aria-labelledby="events-heading">
  <header class="section-heading">
    <div><p>Event ledger</p><h2 id="events-heading">이벤트 운영</h2></div>
    <span>{events.length}개</span>
  </header>

  <div class="event-list">
    {#each events as event (event.id)}
      <article class="event-row">
        <div class="status-cell"><span class:active={event.status === "active"}>{statusLabel[event.status]}</span></div>
        <div class="event-cell">
          <span>{event.type} · {event.activityId}</span>
          <strong>{event.title}</strong>
          <small>{new Date(event.startsAt).toLocaleString("ko-KR")}{event.endsAt ? ` — ${new Date(event.endsAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : ""}</small>
        </div>
        <div class="queue-cell"><span>대기 출석</span><strong>{event.pendingAttendanceCount}</strong></div>
        <div class="row-actions">
          {#if event.status !== "draft"}<button class="paper-btn small" onclick={() => copyPath(event.attendancePath)}>링크</button>{/if}
          {#if event.canActivate}
            <form method="POST" action="?/activateEvent" use:enhance={submit(event, "activated")}><input type="hidden" name="id" value={event.id} /><button class="paper-btn primary small" disabled={processingId !== null}>열기</button></form>
          {/if}
          {#if event.canExpire}
            <form method="POST" action="?/expireEvent" use:enhance={submit(event, "expired")}><input type="hidden" name="id" value={event.id} /><button class="paper-btn small" disabled={processingId !== null}>종료</button></form>
          {/if}
          <button class="paper-btn small" disabled={processingId !== null} onclick={() => { issues = {}; editing = event; }}>수정</button>
          <form method="POST" action="?/deleteEvent" use:enhance={submit(event, "deleted")}>
            <input type="hidden" name="id" value={event.id} />
            <button class="paper-btn danger small" disabled={processingId !== null || !event.canDelete} title={!event.canDelete ? "대기 출석을 먼저 처리해 주세요." : "이벤트 삭제"}>삭제</button>
          </form>
        </div>
      </article>
    {:else}
      <p class="empty-state">등록된 이벤트가 없습니다.</p>
    {/each}
  </div>
</section>

{#if editing}
  <div class="dialog-backdrop" role="presentation" onclick={(event) => event.currentTarget === event.target && (editing = null)}>
    <div class="edit-dialog" role="dialog" aria-modal="true" aria-labelledby="event-edit-heading">
      <header><div><p>Event record</p><h2 id="event-edit-heading">이벤트 수정</h2></div><button class="paper-btn small" onclick={() => editing = null}>닫기</button></header>
      <form method="POST" action="?/updateEvent" use:enhance={submit(editing, "updated")}>
        <input type="hidden" name="id" value={editing.id} />
        <label>
          <span>제목</span>
          <input name="title" value={editing.title} aria-invalid={Boolean(issues.title)} aria-describedby={issues.title ? "event-title-error" : undefined} required />
          {#if issues.title}<small id="event-title-error" class="field-error">{issues.title}</small>{/if}
        </label>
        <label><span>활동 종류</span><select name="type" value={editing.type}>{#each ACTIVITY_TYPES as type (type)}<option value={type}>{type}</option>{/each}</select></label>
        <div class="time-grid">
          <label>
            <span>시작</span>
            <input type="datetime-local" name="startsAtLocal" value={toLocal(editing.startsAt)} aria-invalid={Boolean(issues.startsAtLocal)} aria-describedby={issues.startsAtLocal ? "event-start-error" : undefined} required />
            {#if issues.startsAtLocal}<small id="event-start-error" class="field-error">{issues.startsAtLocal}</small>{/if}
          </label>
          <label>
            <span>종료 (선택)</span>
            <input type="datetime-local" name="endsAtLocal" value={toLocal(editing.endsAt)} aria-invalid={Boolean(issues.endsAtLocal)} aria-describedby={issues.endsAtLocal ? "event-end-error" : undefined} />
            {#if issues.endsAtLocal}<small id="event-end-error" class="field-error">{issues.endsAtLocal}</small>{/if}
          </label>
        </div>
        <button class="paper-btn primary" disabled={processingId !== null}>수정 저장</button>
      </form>
    </div>
  </div>
{/if}

<style>
  .admin-section { display: grid; gap: 0.7rem; }
  .section-heading, .event-row, .row-actions, .edit-dialog > header { display: flex; align-items: center; justify-content: space-between; gap: 0.7rem; }
  .section-heading { align-items: start; padding-bottom: 0.55rem; border-bottom: 1px solid var(--latex-rule); }
  .section-heading p, .section-heading h2, .event-cell span, .event-cell strong, .event-cell small, .queue-cell span, .queue-cell strong, .edit-dialog h2, .edit-dialog header p { margin: 0; }
  .section-heading p, .section-heading > span, .event-cell span, .queue-cell span, .edit-dialog header p { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.58rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; }
  .section-heading h2 { margin-top: 0.12rem; font-size: 1.2rem; font-weight: 570; }
  .event-list { display: grid; border-top: 1px solid var(--latex-rule); }
  .event-row { display: grid; grid-template-columns: 3rem minmax(13rem, 1fr) 4rem auto; padding: 0.68rem 0.2rem; border-bottom: 1px solid var(--latex-rule); }
  .status-cell span { display: inline-grid; place-items: center; min-width: 2.4rem; padding: 0.2rem; border: 1px solid var(--latex-rule); color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.55rem; font-weight: 700; }
  .status-cell span.active { border-color: var(--color-success-text); color: var(--color-success-text); }
  .event-cell { display: grid; min-width: 0; }
  .event-cell strong { margin-top: 0.08rem; font-size: 0.9rem; }
  .event-cell small { color: var(--latex-muted); font-size: 0.68rem; }
  .queue-cell { display: grid; text-align: center; }
  .queue-cell strong { font-family: var(--font-math); font-size: 1.1rem; }
  .row-actions { flex-wrap: wrap; justify-content: flex-end; }
  .empty-state { margin: 0; padding: 1.25rem; border: 1px dashed var(--latex-rule); color: var(--latex-muted); text-align: center; }
  .dialog-backdrop { position: fixed; z-index: 60; inset: 0; display: grid; place-items: center; padding: 1rem; background: color-mix(in srgb, #000 55%, transparent); }
  .edit-dialog { width: min(100%, 36rem); padding: 1rem; border: 1px solid var(--latex-rule); border-top-width: 3px; background: var(--latex-bg); }
  .edit-dialog h2 { font-size: 1.15rem; }
  .edit-dialog form { display: grid; gap: 0.7rem; margin-top: 0.8rem; }
  .edit-dialog label { display: grid; gap: 0.25rem; }
  .edit-dialog label span { font-family: var(--font-mono); font-size: 0.62rem; font-weight: 700; }
  .edit-dialog input, .edit-dialog select { width: 100%; padding: 0.65rem; }
  .time-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; }
  .field-error { color: var(--color-danger-text); font-size: 0.7rem; }
  @media (max-width: 850px) { .event-row { grid-template-columns: 3rem minmax(0, 1fr) 4rem; } .row-actions { grid-column: 2 / -1; justify-content: flex-start; margin-top: 0.45rem; } }
  @media (max-width: 520px) { .event-row { grid-template-columns: 2.8rem minmax(0, 1fr); } .queue-cell { display: none; } .row-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } .row-actions form, .row-actions button { width: 100%; } .time-grid { grid-template-columns: 1fr; } }
</style>
