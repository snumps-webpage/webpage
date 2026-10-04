<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import { untrack } from "svelte";
  import type { AdminMemberDetail } from "$lib/domain/members";
  import {
    applyMemberSectionResult,
    memberRecordDraft,
    scopedMemberAction,
    type AdminMemberActionState,
    type AdminMemberOperation,
  } from "$lib/domain/admin-member-editor";
  import { withdrawalGraceEndsAt } from "$lib/domain/account";
  import { withdrawalTimeLabel } from "$lib/domain/member-withdrawal";

  let {
    member,
    actionState,
    busy,
    submit,
  }: {
    member: AdminMemberDetail;
    actionState: AdminMemberActionState | null;
    busy: boolean;
    submit: (operation: AdminMemberOperation) => SubmitFunction;
  } = $props();
  const initial = untrack(() =>
    applyMemberSectionResult(memberRecordDraft(member), member, actionState),
  );
  let draft = $state(initial);
  let seen = untrack(() => actionState);
  $effect(() => {
    const state = actionState;
    const current = member;
    untrack(() => {
      if (state !== seen) {
        draft = applyMemberSectionResult(draft, current, state);
        seen = state;
      }
    });
  });
  const currentAction = $derived(scopedMemberAction(actionState, member.id));
  const recordIssues = $derived(
    currentAction?.operation === "memberUpdated"
      ? (currentAction.issues ?? {})
      : {},
  );
  const statusIssues = $derived(
    ["statusUpdated", "alumniRevoked", "withdrawalHoldUpdated"].includes(
      currentAction?.operation ?? "",
    )
      ? (currentAction?.issues ?? {})
      : {},
  );
  const privateIssues = $derived(
    currentAction?.operation === "privateInfoUpdated"
      ? (currentAction.issues ?? {})
      : {},
  );

  function statusLabel(status: AdminMemberDetail["status"]) {
    return {
      associate: "준회원",
      regular: "정회원",
      withdrawn: "탈퇴 처리 중",
    }[status];
  }
  function alumniLabel() {
    if (member.isAlumni) return "동문 지위 보유";
    if (member.alumniRevoked) return "동문 지위 박탈됨";
    return "동문 지위 미취득";
  }
</script>

<div class="record-grid">
  <section class="record-section">
    <header>
      <div>
        <p>01 · Member Record</p>
        <h2>회원 기본정보</h2>
      </div>
    </header>
    <!-- Shown for every member: one stored without a join date gets the
         form too, asking for the date (decision #3, audit LC11-3). -->
    <form
      method="POST"
      aria-busy={busy}
      action="?/updateMember"
      use:enhance={submit("memberUpdated")}
    >
      <label class="paper-field">
        <span class="paper-label">이름</span>
        <input
          disabled={busy}
          name="name"
          bind:value={draft.name}
          aria-invalid={!!recordIssues.name}
          aria-describedby={recordIssues.name ? "member-name-error" : undefined}
        />
        {#if recordIssues.name}<span id="member-name-error" class="field-error"
            >{recordIssues.name}</span
          >{/if}
      </label>
      <label class="paper-field">
        <span class="paper-label">학과</span>
        <input
          disabled={busy}
          name="department"
          bind:value={draft.department}
          aria-invalid={!!recordIssues.department}
          aria-describedby={recordIssues.department
            ? "member-department-error"
            : undefined}
        />
        {#if recordIssues.department}<span
            id="member-department-error"
            class="field-error">{recordIssues.department}</span
          >{/if}
      </label>
      <label class="paper-field">
        <span class="paper-label">가입일</span>
        <input
          disabled={busy}
          type="date"
          name="joinedAt"
          bind:value={draft.joinedAt}
          required
          aria-invalid={!!recordIssues.joinedAt}
          aria-describedby={recordIssues.joinedAt
            ? "member-joinedAt-error"
            : undefined}
        />
        {#if recordIssues.joinedAt}<span
            id="member-joinedAt-error"
            class="field-error">{recordIssues.joinedAt}</span
          >{:else if !member.joinedAt}<span class="field-note"
            >가입일 기록이 없습니다. 가입일을 입력해야 기본정보를 저장할 수
            있습니다.</span
          >{/if}
      </label>
      <div class="project-fields">
        <label class="paper-field">
          <span class="paper-label">개인 프로젝트 제목</span>
          <input
            disabled={busy}
            name="projectTitle"
            bind:value={draft.projectTitle}
            aria-invalid={!!recordIssues.projectTitle}
            aria-describedby={recordIssues.projectTitle
              ? "member-projectTitle-error"
              : undefined}
            placeholder="선택 입력"
          />
          {#if recordIssues.projectTitle}<span
              id="member-projectTitle-error"
              class="field-error">{recordIssues.projectTitle}</span
            >{/if}
        </label>
        <label class="paper-field">
          <span class="paper-label">프로젝트 URL</span>
          <input
            disabled={busy}
            type="url"
            name="projectUrl"
            bind:value={draft.projectUrl}
            aria-invalid={!!recordIssues.projectUrl}
            aria-describedby={recordIssues.projectUrl
              ? "member-projectUrl-error"
              : undefined}
            placeholder="https://"
          />
          {#if recordIssues.projectUrl}<span
              id="member-projectUrl-error"
              class="field-error">{recordIssues.projectUrl}</span
            >{/if}
        </label>
      </div>
      {#if recordIssues._form}<p class="field-error">
          {recordIssues._form}
        </p>{/if}
      <footer>
        <p>공개 회원 명단과 프로젝트 아카이브의 원본 데이터입니다.</p>
        <button class="paper-btn primary" disabled={busy}>
          기본정보 저장
        </button>
      </footer>
    </form>
  </section>

  <section class="record-section status-section">
    <header>
      <div>
        <p>02 · Membership</p>
        <h2>회원 지위와 동문</h2>
      </div>
    </header>
    <div class="status-summary">
      <div>
        <span>현재 지위</span><strong>{statusLabel(member.status)}</strong>
      </div>
      <div><span>동문</span><strong>{alumniLabel()}</strong></div>
      <div>
        <span>최근 지위 변경</span>
        <strong>{withdrawalTimeLabel(member.statusChangedAt)}</strong>
      </div>
    </div>

    {#if member.status !== "withdrawn"}
      <form
        class="status-form"
        method="POST"
        aria-busy={busy}
        action="?/setStatus"
        use:enhance={submit("statusUpdated")}
      >
        <label class="paper-field">
          <span class="paper-label">지위 변경</span>
          <select
            name="status"
            bind:value={draft.status}
            disabled={busy}
            aria-invalid={!!statusIssues.status}
            aria-describedby={statusIssues.status
              ? "member-status-error"
              : undefined}
          >
            {#if !["regular", "associate"].includes(draft.status)}<option
                value={draft.status}>입력값 확인 필요</option
              >{/if}
            <option value="associate">준회원</option>
            <option value="regular">정회원</option>
          </select>
        </label>
        <p>
          정회원 승격 시 동문 지위를 함께 취득합니다. 이후 준회원으로 변경해도
          동문 지위는 유지됩니다.
        </p>
        {#if statusIssues.status}<p
            id="member-status-error"
            class="field-error"
          >
            {statusIssues.status}
          </p>{/if}
        <button
          class="paper-btn primary"
          disabled={busy || draft.status === member.status}
          onclick={(event) => {
            if (
              member.status === "regular" &&
              draft.status === "associate" &&
              !confirm(
                "준회원으로 변경해도 동문 지위는 유지됩니다. 계속하시겠습니까?",
              )
            )
              event.preventDefault();
          }}>지위 저장</button
        >
      </form>
    {:else if member.withdrawal}
      <div class="withdrawal-panel">
        <p>
          {withdrawalTimeLabel(member.withdrawal.requestedAt)} 신청 ·
          {member.withdrawal.holdBy
            ? "관리자 보존 필요 표시"
            : `${withdrawalTimeLabel(withdrawalGraceEndsAt(member.withdrawal.requestedAt))} 1개월 유예 기준 · 이후 처리 정책 보류`}
        </p>
        <form
          method="POST"
          aria-busy={busy}
          action={member.withdrawal.holdBy
            ? "?/releaseWithdrawalHold"
            : "?/holdWithdrawal"}
          use:enhance={submit("withdrawalHoldUpdated")}
        >
          <button
            class="paper-btn"
            class:danger={!!member.withdrawal.holdBy}
            disabled={busy}
            onclick={(event) => {
              const message = member.withdrawal?.holdBy
                ? "보존 필요 표시를 해제하면 오늘부터 1개월 유예를 다시 계산합니다. 계속하시겠습니까?"
                : "이 탈퇴 정보를 보존 필요 상태로 표시하시겠습니까?";
              if (!confirm(message)) event.preventDefault();
            }}
            >{member.withdrawal.holdBy
              ? "보존 표시 해제"
              : "보존 필요 표시"}</button
          >
        </form>
      </div>
    {/if}

    {#if member.isAlumni}
      <form
        class="alumni-form"
        method="POST"
        aria-busy={busy}
        action="?/revokeAlumni"
        use:enhance={submit("alumniRevoked")}
      >
        <label class="paper-field">
          <span class="paper-label">동문 지위 박탈 사유</span>
          <textarea
            disabled={busy}
            name="reason"
            rows="2"
            bind:value={draft.reason}
            aria-invalid={!!statusIssues.reason}
            aria-describedby={statusIssues.reason
              ? "member-reason-error"
              : undefined}
            placeholder="회원 기록에 남길 구체적인 사유"></textarea>
          {#if statusIssues.reason}<span
              id="member-reason-error"
              class="field-error">{statusIssues.reason}</span
            >{/if}
        </label>
        <button
          class="paper-btn danger"
          disabled={busy}
          onclick={(event) => {
            if (
              !confirm(
                "동문 지위를 박탈하면 향후 정회원 승격으로 복원되지 않습니다.",
              )
            ) {
              event.preventDefault();
            }
          }}>동문 지위 박탈</button
        >
      </form>
    {:else if member.alumniRevoked}
      <p class="revoked-note">
        박탈 이력이 있어 정회원으로 승격해도 동문 지위가 자동 부여되지 않습니다.
      </p>
      <p class="revoked-note">
        박탈 사유: {member.alumniRevocationReason ??
          "회원 기록에 없음 (필드 도입 전 박탈 — 감사 로그 참조)"}
      </p>
    {/if}
    {#if statusIssues._form}<p class="field-error section-error">
        {statusIssues._form}
      </p>{/if}
  </section>

  <section class="record-section private-section">
    <header>
      <div>
        <p>03 · Private Record</p>
        <h2>비공개 회원 정보</h2>
      </div>
    </header>
    {#if member.privateInfo}
      <form
        method="POST"
        aria-busy={busy}
        action="?/updatePrivateInfo"
        use:enhance={submit("privateInfoUpdated")}
      >
        <label class="paper-field">
          <span class="paper-label">로그인 이메일</span>
          <input
            disabled={busy}
            type="email"
            name="email"
            bind:value={draft.email}
            aria-invalid={!!privateIssues.email}
            aria-describedby={privateIssues.email
              ? "member-email-error"
              : undefined}
          />
          {#if privateIssues.email}<span
              id="member-email-error"
              class="field-error">{privateIssues.email}</span
            >{/if}
        </label>
        <label class="paper-field">
          <span class="paper-label">전화번호</span>
          <input
            disabled={busy}
            name="phone"
            bind:value={draft.phone}
            aria-invalid={!!privateIssues.phone}
            aria-describedby={privateIssues.phone
              ? "member-phone-error"
              : undefined}
            placeholder="010-1234-5678"
          />
          {#if privateIssues.phone}<span
              id="member-phone-error"
              class="field-error">{privateIssues.phone}</span
            >{/if}
        </label>
        <label class="paper-field background-field">
          <span class="paper-label">배경지식</span>
          <textarea
            disabled={busy}
            name="background"
            rows="3"
            bind:value={draft.background}
            aria-invalid={!!privateIssues.background}
            aria-describedby={privateIssues.background
              ? "member-background-error"
              : undefined}></textarea>
          {#if privateIssues.background}<span
              id="member-background-error"
              class="field-error">{privateIssues.background}</span
            >{/if}
        </label>
        {#if privateIssues._form}<p class="field-error">
            {privateIssues._form}
          </p>{/if}
        <footer>
          <p>열람과 변경은 감사 기록 대상이며 공개 DTO에 포함되지 않습니다.</p>
          <button class="paper-btn primary" disabled={busy}>
            비공개 정보 저장
          </button>
        </footer>
      </form>
    {:else}
      <p class="section-note">개인정보 레코드가 없어 수정할 수 없습니다.</p>
    {/if}
  </section>
</div>

<style>
  .record-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(20rem, 0.85fr);
    gap: 0.8rem;
    margin-bottom: 0.8rem;
    align-items: start;
  }

  .record-section {
    border: 1px solid var(--latex-rule);
  }
  .record-section > header {
    padding: 0.7rem 0.8rem;
    border-bottom: 2px solid var(--latex-rule);
  }
  .record-section header p,
  .record-section h2,
  .record-section form p {
    margin: 0;
  }
  .record-section header p {
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .record-section h2 {
    margin-top: 0.15rem;
    font-size: 1.05rem;
    font-weight: 570;
  }
  .record-section form {
    display: grid;
    gap: 0.72rem;
    padding: 0.8rem;
  }
  .project-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.65rem;
  }
  .record-section footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.8rem;
    padding-top: 0.7rem;
    border-top: 1px solid var(--latex-rule);
  }
  .record-section footer p,
  .status-form > p,
  .section-note,
  .revoked-note {
    color: var(--latex-muted);
    font-size: 0.72rem;
    line-height: 1.55;
  }
  .section-note,
  .revoked-note {
    margin: 0.8rem;
  }
  .field-error {
    display: block;
    margin: 0.3rem 0 0;
    color: var(--latex-accent);
    font-size: 0.72rem;
    font-weight: 650;
  }
  .field-note {
    display: block;
    margin: 0.3rem 0 0;
    color: var(--latex-muted);
    font-size: 0.72rem;
  }
  .status-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
    padding: 0.8rem;
  }
  .status-summary div:last-child {
    grid-column: 1 / -1;
  }
  .status-summary div {
    display: grid;
    gap: 0.15rem;
  }
  .status-summary span {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.56rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .status-summary strong {
    font-size: 0.75rem;
    font-weight: 560;
  }
  .status-form,
  .alumni-form,
  .withdrawal-panel {
    border-top: 1px solid var(--latex-rule);
  }
  .alumni-form {
    background: color-mix(in srgb, var(--latex-accent) 4%, transparent);
  }
  .withdrawal-panel {
    display: grid;
    gap: 0.7rem;
    padding: 0.8rem;
  }
  .withdrawal-panel p {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.72rem;
    line-height: 1.55;
  }
  .withdrawal-panel form {
    padding: 0;
  }
  .section-error {
    margin: 0 0.8rem 0.8rem;
  }
  .private-section {
    grid-column: 1 / -1;
  }
  .private-section form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
  .private-section .background-field,
  .private-section footer,
  .private-section form > .field-error {
    grid-column: 1 / -1;
  }

  @media (max-width: 820px) {
    .record-grid {
      grid-template-columns: 1fr;
    }
    .private-section {
      grid-column: auto;
    }
  }

  @media (max-width: 540px) {
    .project-fields,
    .private-section form {
      grid-template-columns: 1fr;
    }
    .private-section .background-field,
    .private-section footer,
    .private-section form > .field-error {
      grid-column: auto;
    }
    .record-section footer {
      align-items: stretch;
      flex-direction: column;
    }
    .record-section footer button {
      width: 100%;
    }
  }
</style>
