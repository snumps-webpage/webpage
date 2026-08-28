<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { AdminAttendanceQueueItem } from "$lib/domain/admin-dashboard";

  interface Props {
    records: AdminAttendanceQueueItem[];
    onResolved: (attendanceId: string, operation: "approved" | "rejected" | "updated" | "deleted", record?: AdminAttendanceQueueItem) => void;
    onError: (message: string) => void;
  }

  let { records, onResolved, onError }: Props = $props();
  let processingId = $state<string | null>(null);
  let editing = $state<AdminAttendanceQueueItem | null>(null);
  let issues = $state<Record<string, string>>({});

  function toLocal(value: string) { return value.slice(0, 16); }

  function submit(record: AdminAttendanceQueueItem, operation: "approved" | "rejected" | "updated" | "deleted"): SubmitFunction {
    return () => {
      processingId = record.id;
      return async ({ result }) => {
        processingId = null;
        if (result.type === "success") {
          const data = result.data as { attendance?: AdminAttendanceQueueItem };
          onResolved(record.id, operation, data.attendance ?? record);
          if (operation === "updated") editing = null;
        } else {
          const data = result.type === "failure"
            ? result.data as { error?: string; issues?: Record<string, string> }
            : null;
          issues = data?.issues ?? {};
          onError(data?.error ?? "출석 요청을 처리하지 못했습니다.");
        }
      };
    };
  }
</script>

<section class="admin-section" aria-labelledby="attendance-heading">
  <header class="section-heading">
    <div><p>Queue B</p><h2 id="attendance-heading">출석 승인 대기</h2></div>
    <span>{records.length}건</span>
  </header>
  <p class="policy-note">공개 링크 체크인은 승인 후에만 활동 이력과 발표자 명단에 반영됩니다.</p>

  <div class="attendance-list">
    {#each records as record (record.id)}
      <article class="attendance-row">
        <div class="member-cell">
          <span>{record.eventTitle}</span>
          <strong>{record.member.name}</strong>
          <small>{record.member.department} · {record.member.email}</small>
        </div>
        <div class="time-cell">
          <span>체크인</span>
          <time datetime={record.startTime}>{new Date(record.startTime).toLocaleString("ko-KR")}</time>
        </div>
        <div class="row-actions">
          <form method="POST" action="?/approveAttendance" use:enhance={submit(record, "approved")}>
            <input type="hidden" name="eventId" value={record.eventId} />
            <input type="hidden" name="queueId" value={record.id} />
            <button class="paper-btn primary small" disabled={processingId !== null}>승인</button>
          </form>
          <form method="POST" action="?/rejectAttendance" use:enhance={submit(record, "rejected")}>
            <input type="hidden" name="eventId" value={record.eventId} />
            <input type="hidden" name="queueId" value={record.id} />
            <button class="paper-btn danger small" disabled={processingId !== null}>반려</button>
          </form>
          <button class="paper-btn small" disabled={processingId !== null} onclick={() => { issues = {}; editing = record; }}>시간</button>
          <form method="POST" action="?/deleteAttendanceRecord" use:enhance={submit(record, "deleted")}>
            <input type="hidden" name="eventId" value={record.eventId} />
            <input type="hidden" name="queueId" value={record.id} />
            <button class="paper-btn small" disabled={processingId !== null}>삭제</button>
          </form>
        </div>
      </article>
    {:else}
      <p class="empty-state">승인을 기다리는 출석이 없습니다.</p>
    {/each}
  </div>
</section>

{#if editing}
  <div class="dialog-backdrop" role="presentation" onclick={(event) => event.currentTarget === event.target && (editing = null)}>
    <div class="edit-dialog" role="dialog" aria-modal="true" aria-labelledby="attendance-edit-heading">
      <header><div><p>Attendance record</p><h2 id="attendance-edit-heading">출석 시간 수정</h2></div><button class="paper-btn small" onclick={() => editing = null}>닫기</button></header>
      <p>{editing.member.name} · {editing.eventTitle}</p>
      <form method="POST" action="?/updateAttendanceTime" use:enhance={submit(editing, "updated")}>
        <input type="hidden" name="eventId" value={editing.eventId} />
        <input type="hidden" name="queueId" value={editing.id} />
        <label>
          <span>시작</span>
          <input type="datetime-local" name="startTimeLocal" value={toLocal(editing.startTime)} aria-invalid={Boolean(issues.startTimeLocal)} aria-describedby={issues.startTimeLocal ? "attendance-start-error" : undefined} required />
          {#if issues.startTimeLocal}<small id="attendance-start-error" class="field-error">{issues.startTimeLocal}</small>{/if}
        </label>
        <label>
          <span>종료</span>
          <input type="datetime-local" name="endTimeLocal" value={toLocal(editing.endTime)} aria-invalid={Boolean(issues.endTimeLocal)} aria-describedby={issues.endTimeLocal ? "attendance-end-error" : undefined} required />
          {#if issues.endTimeLocal}<small id="attendance-end-error" class="field-error">{issues.endTimeLocal}</small>{/if}
        </label>
        <button class="paper-btn primary" disabled={processingId !== null}>수정 저장</button>
      </form>
    </div>
  </div>
{/if}

<style>
  .admin-section { display: grid; gap: 0.65rem; }
  .section-heading, .attendance-row, .row-actions, .edit-dialog > header { display: flex; align-items: center; justify-content: space-between; gap: 0.7rem; }
  .section-heading { align-items: start; padding-bottom: 0.55rem; border-bottom: 1px solid var(--latex-rule); }
  .section-heading p, .section-heading h2, .policy-note, .member-cell span, .member-cell strong, .member-cell small, .time-cell span, .time-cell time, .edit-dialog p, .edit-dialog h2, .edit-dialog header p { margin: 0; }
  .section-heading p, .section-heading > span, .member-cell span, .time-cell span, .edit-dialog header p { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.58rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; }
  .section-heading h2 { margin-top: 0.12rem; font-size: 1.2rem; font-weight: 570; }
  .policy-note { padding: 0.55rem 0.7rem; border-left: 3px solid var(--latex-accent); color: var(--latex-muted); font-size: 0.78rem; }
  .attendance-list { display: grid; border-top: 1px solid var(--latex-rule); }
  .attendance-row { padding: 0.72rem 0.25rem; border-bottom: 1px solid var(--latex-rule); }
  .member-cell { display: grid; min-width: 0; }
  .member-cell strong { margin-top: 0.1rem; font-size: 0.94rem; }
  .member-cell small, .time-cell time { color: var(--latex-muted); font-size: 0.68rem; overflow-wrap: anywhere; }
  .time-cell { display: grid; min-width: 10rem; }
  .row-actions { flex-wrap: wrap; justify-content: flex-end; }
  .empty-state { margin: 0; padding: 1.25rem; border: 1px dashed var(--latex-rule); color: var(--latex-muted); text-align: center; }
  .dialog-backdrop { position: fixed; z-index: 60; inset: 0; display: grid; place-items: center; padding: 1rem; background: color-mix(in srgb, #000 55%, transparent); }
  .edit-dialog { width: min(100%, 28rem); padding: 1rem; border: 1px solid var(--latex-rule); border-top-width: 3px; background: var(--latex-bg); }
  .edit-dialog h2 { font-size: 1.15rem; }
  .edit-dialog > p { margin: 0.7rem 0; color: var(--latex-muted); font-size: 0.78rem; }
  .edit-dialog form { display: grid; gap: 0.65rem; }
  .edit-dialog label { display: grid; gap: 0.25rem; }
  .edit-dialog label span { font-family: var(--font-mono); font-size: 0.62rem; font-weight: 700; }
  .edit-dialog input { width: 100%; padding: 0.65rem; }
  .field-error { color: var(--color-danger-text); font-size: 0.7rem; }
  @media (max-width: 760px) { .attendance-row { align-items: stretch; flex-direction: column; } .time-cell { min-width: 0; } .row-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); } .row-actions form, .row-actions button { width: 100%; } }
  @media (max-width: 470px) { .row-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
