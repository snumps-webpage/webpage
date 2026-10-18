<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import type { AdminStudyRecord } from "$lib/domain/admin-records";
  import {
    attendeeRowKeys,
    studyParticipantRows,
    type DirectoryPicker,
    type StudyParticipantRow,
  } from "$lib/domain/recorded-people";

  /*
   * 관리자 스터디 참가자 편집기 (snumps-webpage/D-000043·057). 선택지는 통합
   * 명부 전원(탈퇴자·옛 회원 포함), 한 사람 한 칸 — 칸과 제출 id 규칙은
   * studyParticipantRows. 주최자 칸은 잠겨 있다: 주최자는 참가자에서 뺄 수
   * 없다(서버도 거부). '출석자에서 채우기'는 연결된 '스터디' 종류 활동의
   * 출석자를 체크만 한다(연결된 회식 제외, D-000137) — 저장은 관리자가 누를 때.
   */

  let {
    record,
    pickers,
  }: { record: AdminStudyRecord; pickers: DirectoryPicker[] } = $props();

  const rows = $derived(studyParticipantRows(record, pickers));
  const candidateKeys = $derived(
    attendeeRowKeys(rows, record.attendeeCandidates),
  );

  let started = false;
  let open = $state(false);
  let query = $state("");
  const checked = new SvelteSet<string>();

  function ontoggle(event: Event) {
    open = (event.currentTarget as HTMLDetailsElement).open;
    if (open && !started) {
      started = true;
      for (const r of rows) if (r.organizer || r.saved) checked.add(r.key);
    }
  }

  function fillFromAttendees() {
    for (const key of candidateKeys) checked.add(key);
  }

  const visible = (row: StudyParticipantRow) => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return (
      row.organizer ||
      row.saved ||
      checked.has(row.key) ||
      !normalized ||
      [row.name, row.department].some((value) =>
        value.toLocaleLowerCase("ko-KR").includes(normalized),
      )
    );
  };
</script>

<details class="participant-editor" {ontoggle}>
  <summary>
    <h3>참가자 편집</h3>
    <span>현재 {record.participantIds.length}명</span>
  </summary>
  {#if open}
    <form
      method="POST"
      action="?/setParticipants"
      onsubmit={(event) => {
        if (!confirm("참가자 명단을 체크한 사람으로 저장할까요?"))
          event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={record.id} />
      <p class="hint">
        통합 명부 전원(이전 회원·탈퇴 회원 포함)에서 고릅니다. 종료된 스터디도
        고칠 수 있습니다. 주최자는 뺄 수 없습니다.
      </p>
      <div class="tools">
        <label
          ><span class="paper-label">명부 검색</span><input
            type="search"
            bind:value={query}
            placeholder="이름 또는 학과"
          /></label
        >
        <button
          class="paper-btn"
          type="button"
          disabled={candidateKeys.length === 0}
          onclick={fillFromAttendees}
          >출석자에서 채우기 ({candidateKeys.length}명)</button
        >
      </div>
      {#if record.attendeeCandidates.length === 0}
        <p class="hint">
          연결된 스터디 활동의 출석자가 없습니다. 활동 기록 관리에서 스터디를
          연결하면 채울 수 있습니다.
        </p>
      {/if}
      <div class="picker" role="group" aria-label="참가자 선택">
        {#each rows as row (row.key)}
          <label hidden={!visible(row)} class:saved={row.saved}
            ><input
              type="checkbox"
              name="participantIds"
              value={row.value}
              checked={checked.has(row.key)}
              disabled={row.organizer}
              onchange={(event) =>
                event.currentTarget.checked
                  ? checked.add(row.key)
                  : checked.delete(row.key)}
            /><span
              >{row.name}<small
                >{row.organizer
                  ? "주최자"
                  : row.former
                    ? "이전 회원"
                    : row.department}</small
              ></span
            ></label
          >
          {#if row.organizer}<input
              type="hidden"
              name="participantIds"
              value={row.value}
            />{/if}
        {/each}
      </div>
      <div class="actions">
        <span>{checked.size}명 선택</span>
        <button class="paper-btn" type="submit">참가자 저장</button>
      </div>
    </form>
  {/if}
</details>

<style>
  .participant-editor {
    padding: 0.7rem;
    border: 1px solid var(--latex-rule);
  }
  summary {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.7rem;
    cursor: pointer;
  }
  h3 {
    display: inline;
    margin: 0;
    font-size: 0.9rem;
    font-weight: 570;
  }
  summary span,
  .actions span {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
  }
  form {
    display: grid;
    gap: 0.6rem;
    margin-top: 0.6rem;
  }
  .hint {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.7rem;
    line-height: 1.5;
  }
  .tools {
    display: flex;
    align-items: end;
    gap: 0.6rem;
  }
  .tools label {
    flex: 1;
    min-width: 0;
  }
  .tools input {
    width: 100%;
    padding: 0.55rem 0.65rem;
  }
  .picker {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
    max-height: 22rem;
    overflow-y: auto;
  }
  .picker label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.35rem;
    border: 1px solid color-mix(in srgb, var(--latex-rule) 30%, transparent);
  }
  .picker label[hidden] {
    display: none;
  }
  .picker label.saved {
    border-color: var(--latex-rule);
  }
  .picker input {
    margin: 0;
  }
  .picker span {
    display: grid;
    font-size: 0.72rem;
  }
  .picker small {
    color: var(--latex-muted);
    font-size: 0.56rem;
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
  }
  @media (max-width: 760px) {
    .picker {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 520px) {
    .tools,
    .actions {
      align-items: stretch;
      flex-direction: column;
    }
    .picker {
      grid-template-columns: 1fr;
    }
    .tools button,
    .actions button {
      width: 100%;
    }
  }
</style>
