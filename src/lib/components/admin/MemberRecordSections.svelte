<script lang="ts">
  import { enhance } from "$app/forms";
  import { untrack } from "svelte";
  import type {
    AdminMemberDetail,
    MemberAdminOperationResult,
  } from "$lib/domain/members";

  let {
    member,
    onresult,
  }: {
    member: AdminMemberDetail;
    onresult: (result: MemberAdminOperationResult) => void;
  } = $props();

  const initialMember = untrack(() => ({
    name: member.name,
    department: member.department,
    joinedAt: member.joinedAt,
    projectTitle: member.project?.title ?? "",
    projectUrl: member.project?.url ?? "",
    status: member.status,
    privateEmail: member.privateInfo?.email ?? "",
    privatePhone: member.privateInfo?.phone ?? "",
    privateBackground: member.privateInfo?.background ?? "",
  }));
  let name = $state(initialMember.name);
  let department = $state(initialMember.department);
  let joinedAt = $state(initialMember.joinedAt ?? "");
  let projectTitle = $state(initialMember.projectTitle);
  let projectUrl = $state(initialMember.projectUrl);
  let selectedStatus = $state<"associate" | "regular">(
    initialMember.status === "regular" ? "regular" : "associate",
  );
  let alumniReason = $state("");
  let privateEmail = $state(initialMember.privateEmail);
  let privatePhone = $state(initialMember.privatePhone);
  let privateBackground = $state(initialMember.privateBackground);
  let processing = $state<string | null>(null);
  let recordIssues = $state<Record<string, string>>({});
  let statusIssues = $state<Record<string, string>>({});
  let privateIssues = $state<Record<string, string>>({});

  type SectionKind = "record" | "status" | "alumni" | "private" | "withdrawal";

  function failureData(result: import("@sveltejs/kit").ActionResult) {
    return result.type === "failure"
      ? (result.data as {
          error?: string;
          issues?: Record<string, string>;
        })
      : null;
  }

  function actionEnhancer(kind: SectionKind) {
    processing = kind;
    if (kind === "record") recordIssues = {};
    if (kind === "status" || kind === "alumni" || kind === "withdrawal") {
      statusIssues = {};
    }
    if (kind === "private") privateIssues = {};

    return async ({ result }: { result: import("@sveltejs/kit").ActionResult }) => {
      processing = null;
      if (result.type === "success") {
        const operation = result.data as MemberAdminOperationResult;
        onresult(operation);
        if (operation.operation === "alumniRevoked") alumniReason = "";
        return;
      }
      const failure = failureData(result);
      const issues = failure?.issues ?? {
        _form: failure?.error ?? "변경 사항을 저장하지 못했습니다.",
      };
      if (kind === "record") recordIssues = issues;
      else if (kind === "private") privateIssues = issues;
      else statusIssues = issues;
    };
  }

  function statusLabel(status: AdminMemberDetail["status"]) {
    return { associate: "준회원", regular: "정회원", withdrawn: "탈퇴 처리 중" }[
      status
    ];
  }

  function alumniLabel() {
    if (member.isAlumni) return "동문 지위 보유";
    if (member.alumniRevoked) return "동문 지위 박탈됨";
    return "동문 지위 미취득";
  }

  function graceEndDate(requestedAt: string) {
    const date = new Date(requestedAt);
    return new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
    ).toLocaleDateString("ko-KR");
  }
</script>

<div class="record-grid">
  <section class="record-section">
    <header>
      <div><p>01 · Member Record</p><h2>회원 기본정보</h2></div>
    </header>
    {#if member.joinedAt}
      <form
        method="POST"
        action="?/updateMember"
        use:enhance={() => actionEnhancer("record")}
      >
        <label class="paper-field">
          <span class="paper-label">이름</span>
          <input name="name" bind:value={name} aria-invalid={!!recordIssues.name} />
          {#if recordIssues.name}<span class="field-error">{recordIssues.name}</span>{/if}
        </label>
        <label class="paper-field">
          <span class="paper-label">학과</span>
          <input
            name="department"
            bind:value={department}
            aria-invalid={!!recordIssues.department}
          />
          {#if recordIssues.department}<span class="field-error">{recordIssues.department}</span>{/if}
        </label>
        <label class="paper-field">
          <span class="paper-label">가입일</span>
          <input
            type="date"
            name="joinedAt"
            bind:value={joinedAt}
            aria-invalid={!!recordIssues.joinedAt}
          />
          {#if recordIssues.joinedAt}<span class="field-error">{recordIssues.joinedAt}</span>{/if}
        </label>
        <div class="project-fields">
          <label class="paper-field">
            <span class="paper-label">개인 프로젝트 제목</span>
            <input
              name="projectTitle"
              bind:value={projectTitle}
              aria-invalid={!!recordIssues.projectTitle}
              placeholder="선택 입력"
            />
            {#if recordIssues.projectTitle}<span class="field-error">{recordIssues.projectTitle}</span>{/if}
          </label>
          <label class="paper-field">
            <span class="paper-label">프로젝트 URL</span>
            <input
              type="url"
              name="projectUrl"
              bind:value={projectUrl}
              aria-invalid={!!recordIssues.projectUrl}
              placeholder="https://"
            />
            {#if recordIssues.projectUrl}<span class="field-error">{recordIssues.projectUrl}</span>{/if}
          </label>
        </div>
        {#if recordIssues._form}<p class="field-error">{recordIssues._form}</p>{/if}
        <footer>
          <p>공개 회원 명단과 프로젝트 아카이브의 원본 데이터입니다.</p>
          <button class="paper-btn primary" disabled={processing === "record"}>
            기본정보 저장
          </button>
        </footer>
      </form>
    {:else}
      <p class="section-note">가입 정보 레코드가 없어 수정할 수 없습니다.</p>
    {/if}
  </section>

  <section class="record-section status-section">
    <header>
      <div><p>02 · Membership</p><h2>회원 지위와 동문</h2></div>
    </header>
    <div class="status-summary">
      <div><span>현재 지위</span><strong>{statusLabel(member.status)}</strong></div>
      <div><span>동문</span><strong>{alumniLabel()}</strong></div>
      <div>
        <span>최근 지위 변경</span>
        <strong>{new Date(member.statusChangedAt).toLocaleString("ko-KR")}</strong>
      </div>
    </div>

    {#if member.status !== "withdrawn"}
      <form
        class="status-form"
        method="POST"
        action="?/setStatus"
        use:enhance={() => actionEnhancer("status")}
      >
        <label class="paper-field">
          <span class="paper-label">지위 변경</span>
          <select name="status" bind:value={selectedStatus}>
            <option value="associate">준회원</option>
            <option value="regular">정회원</option>
          </select>
        </label>
        <p>
          정회원 승격 시 동문 지위를 함께 취득합니다. 이후 준회원으로 변경해도 동문 지위는 유지됩니다.
        </p>
        {#if statusIssues.status}<p class="field-error">{statusIssues.status}</p>{/if}
        <button
          class="paper-btn primary"
          disabled={processing === "status" || selectedStatus === member.status}
          onclick={(event) => {
            if (
              member.status === "regular" &&
              selectedStatus === "associate" &&
              !confirm("준회원으로 변경해도 동문 지위는 유지됩니다. 계속하시겠습니까?")
            ) event.preventDefault();
          }}
        >지위 저장</button>
      </form>
    {:else if member.withdrawal}
      <div class="withdrawal-panel">
        <p>
          {new Date(member.withdrawal.requestedAt).toLocaleString("ko-KR")} 신청 ·
          {member.withdrawal.holdBy
            ? "관리자 보존 필요 표시"
            : `${graceEndDate(member.withdrawal.requestedAt)} 유예 종료 · 이후 처리 정책 보류`}
        </p>
        <form
          method="POST"
          action={member.withdrawal.holdBy
            ? "?/releaseWithdrawalHold"
            : "?/holdWithdrawal"}
          use:enhance={() => actionEnhancer("withdrawal")}
        >
          <button
            class="paper-btn"
            class:danger={!!member.withdrawal.holdBy}
            disabled={processing === "withdrawal"}
            onclick={(event) => {
              const message = member.withdrawal?.holdBy
                ? "보존 필요 표시를 해제하면 오늘부터 1개월 유예를 다시 계산합니다. 계속하시겠습니까?"
                : "이 탈퇴 정보를 보존 필요 상태로 표시하시겠습니까?";
              if (!confirm(message)) event.preventDefault();
            }}
          >{member.withdrawal.holdBy ? "보존 표시 해제" : "보존 필요 표시"}</button>
        </form>
      </div>
    {/if}

    {#if member.isAlumni}
      <form
        class="alumni-form"
        method="POST"
        action="?/revokeAlumni"
        use:enhance={() => actionEnhancer("alumni")}
      >
        <label class="paper-field">
          <span class="paper-label">동문 지위 박탈 사유</span>
          <textarea
            name="reason"
            rows="2"
            bind:value={alumniReason}
            aria-invalid={!!statusIssues.reason}
            placeholder="감사 기록에 남길 구체적인 사유"
          ></textarea>
          {#if statusIssues.reason}<span class="field-error">{statusIssues.reason}</span>{/if}
        </label>
        <button
          class="paper-btn danger"
          disabled={processing === "alumni"}
          onclick={(event) => {
            if (!confirm("동문 지위를 박탈하면 향후 정회원 승격으로 복원되지 않습니다.")) {
              event.preventDefault();
            }
          }}
        >동문 지위 박탈</button>
      </form>
    {:else if member.alumniRevoked}
      <p class="revoked-note">박탈 이력이 있어 정회원으로 승격해도 동문 지위가 자동 부여되지 않습니다.</p>
    {/if}
    {#if statusIssues._form}<p class="field-error section-error">{statusIssues._form}</p>{/if}
  </section>

  <section class="record-section private-section">
    <header>
      <div><p>03 · Private Record</p><h2>비공개 회원 정보</h2></div>
    </header>
    {#if member.privateInfo}
      <form
        method="POST"
        action="?/updatePrivateInfo"
        use:enhance={() => actionEnhancer("private")}
      >
        <label class="paper-field">
          <span class="paper-label">로그인 이메일</span>
          <input
            type="email"
            name="email"
            bind:value={privateEmail}
            aria-invalid={!!privateIssues.email}
          />
          {#if privateIssues.email}<span class="field-error">{privateIssues.email}</span>{/if}
        </label>
        <label class="paper-field">
          <span class="paper-label">전화번호</span>
          <input
            name="phone"
            bind:value={privatePhone}
            aria-invalid={!!privateIssues.phone}
            placeholder="010-1234-5678"
          />
          {#if privateIssues.phone}<span class="field-error">{privateIssues.phone}</span>{/if}
        </label>
        <label class="paper-field background-field">
          <span class="paper-label">배경지식</span>
          <textarea
            name="background"
            rows="3"
            bind:value={privateBackground}
            aria-invalid={!!privateIssues.background}
          ></textarea>
          {#if privateIssues.background}<span class="field-error">{privateIssues.background}</span>{/if}
        </label>
        {#if privateIssues._form}<p class="field-error">{privateIssues._form}</p>{/if}
        <footer>
          <p>열람과 변경은 감사 기록 대상이며 공개 DTO에 포함되지 않습니다.</p>
          <button class="paper-btn primary" disabled={processing === "private"}>
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

  .record-section { border: 1px solid var(--latex-rule); }
  .record-section > header {
    padding: 0.7rem 0.8rem;
    border-bottom: 2px solid var(--latex-rule);
  }
  .record-section header p,
  .record-section h2,
  .record-section form p { margin: 0; }
  .record-section header p {
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .record-section h2 { margin-top: 0.15rem; font-size: 1.05rem; font-weight: 570; }
  .record-section form { display: grid; gap: 0.72rem; padding: 0.8rem; }
  .project-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; }
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
  .revoked-note { margin: 0.8rem; }
  .field-error { display: block; margin: 0.3rem 0 0; color: var(--latex-accent); font-size: 0.72rem; font-weight: 650; }
  .status-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
    padding: 0.8rem;
  }
  .status-summary div:last-child { grid-column: 1 / -1; }
  .status-summary div { display: grid; gap: 0.15rem; }
  .status-summary span {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.56rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .status-summary strong { font-size: 0.75rem; font-weight: 560; }
  .status-form,
  .alumni-form,
  .withdrawal-panel { border-top: 1px solid var(--latex-rule); }
  .alumni-form { background: color-mix(in srgb, var(--latex-accent) 4%, transparent); }
  .withdrawal-panel { display: grid; gap: 0.7rem; padding: 0.8rem; }
  .withdrawal-panel p { margin: 0; color: var(--latex-muted); font-size: 0.72rem; line-height: 1.55; }
  .withdrawal-panel form { padding: 0; }
  .section-error { margin: 0 0.8rem 0.8rem; }
  .private-section { grid-column: 1 / -1; }
  .private-section form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
  .private-section .background-field,
  .private-section footer,
  .private-section form > .field-error { grid-column: 1 / -1; }
  :global(.paper-btn.danger) { border-color: var(--latex-accent); color: var(--latex-accent); }

  @media (max-width: 820px) {
    .record-grid { grid-template-columns: 1fr; }
    .private-section { grid-column: auto; }
  }

  @media (max-width: 540px) {
    .project-fields,
    .private-section form { grid-template-columns: 1fr; }
    .private-section .background-field,
    .private-section footer,
    .private-section form > .field-error { grid-column: auto; }
    .record-section footer { align-items: stretch; flex-direction: column; }
    .record-section footer button { width: 100%; }
  }
</style>
