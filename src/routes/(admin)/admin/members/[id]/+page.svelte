<script lang="ts">
  import { enhance } from "$app/forms";
  import MemberRecordSections, {
    type MemberSectionOperation,
  } from "$lib/components/admin/MemberRecordSections.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import type { MemberRoleAssignment } from "$lib/domain/members";
  import { MANUSCRIPT } from "$lib/constants";

  let { data } = $props();
  // The load is the record authority; successful actions re-run it (update()),
  // so the page state is derived and the editable drafts resync afterwards.
  const member = $derived(data.member);
  let roles = $state<MemberRoleAssignment[]>([]);
  let contactStatus = $state<"granted" | "revoked">("revoked");
  let contactPhone = $state("");
  let contactEmail = $state("");
  $effect(() => {
    roles = structuredClone($state.snapshot(data.member.roles));
    contactStatus = data.member.publicContact ? "granted" : "revoked";
    contactPhone = data.member.publicContact?.phone ?? "";
    contactEmail = data.member.publicContact?.email ?? "";
  });
  let roleIssue = $state<string | null>(null);
  let contactIssues = $state<Record<string, string>>({});
  let processing = $state<string | null>(null);
  let notice = $state<{ tone: "success" | "error"; message: string } | null>(null);

  function addRole() {
    roles = [...roles, { term: "26-2", title: "" }];
    roleIssue = null;
  }

  function removeRole(index: number) {
    roles = roles.filter((_, itemIndex) => itemIndex !== index);
    roleIssue = null;
  }

  /** One `26-2 회장` line per role — the ?/setRoles action's wire format. */
  const rolesAsLines = $derived(
    roles.map((role) => `${role.term} ${role.title}`.trim()).join("\n"),
  );

  function handleSection(operation: MemberSectionOperation) {
    if (operation === "memberUpdated") {
      notice = { tone: "success", message: "회원 기본정보를 저장했습니다." };
    }
    if (operation === "statusUpdated") {
      notice = {
        tone: "success",
        message: `회원 지위를 ${member.status === "regular" ? "정회원" : "준회원"}으로 변경했습니다.`,
      };
    }
    if (operation === "alumniRevoked") {
      notice = { tone: "success", message: "동문 지위를 박탈하고 감사 기록을 남겼습니다." };
    }
    if (operation === "privateInfoUpdated") {
      notice = { tone: "success", message: "비공개 회원 정보를 저장하고 감사 기록을 남겼습니다." };
    }
    if (operation === "withdrawalHoldUpdated") {
      notice = {
        tone: "success",
        message: member.withdrawal?.holdBy
          ? "탈퇴 정보를 보존 필요 상태로 표시했습니다."
          : "보존 필요 표시를 해제했습니다. 오늘부터 1개월 유예를 다시 계산합니다.",
      };
    }
  }

  function actionEnhancer(kind: "roles" | "admin" | "contact") {
    processing = kind;
    notice = null;
    if (kind === "roles") roleIssue = null;
    if (kind === "contact") contactIssues = {};
    return async ({
      result,
      update,
    }: {
      result: import("@sveltejs/kit").ActionResult;
      update: (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;
    }) => {
      processing = null;
      if (result.type === "success") {
        await update({ reset: false });
        if (kind === "roles") {
          notice = { tone: "success", message: "학기별 직책을 저장하고 감사 기록을 남겼습니다." };
        } else if (kind === "admin") {
          notice = { tone: "success", message: `관리자 권한을 ${member.isAdmin ? "부여" : "회수"}했습니다.` };
        } else {
          notice = {
            tone: "success",
            message:
              contactStatus === "granted"
                ? "전화번호와 이메일 공개 상태를 승인했습니다. 현재 회장단 역할일 때만 공개됩니다."
                : "공개 동의를 철회하고 저장된 공개 전화번호와 이메일을 제거했습니다.",
          };
        }
        return;
      }
      const failure = result.type === "failure"
        ? result.data as { error?: string; message?: string }
        : null;
      const detail = failure?.message ?? failure?.error;
      if (kind === "roles") roleIssue = detail ?? "직책을 저장하지 못했습니다.";
      else if (kind === "contact") contactIssues = { _form: detail ?? "공개 연락처를 저장하지 못했습니다." };
      else notice = { tone: "error", message: detail ?? "관리자 권한을 변경하지 못했습니다." };
    };
  }
</script>

<svelte:head><title>{member.name} 권한 기록 · SNUMPS 관리자</title></svelte:head>

<article class="paper-document member-authority-paper">
  <ManuscriptHeader
    title={member.name}
    subtitle="Member Authority Record"
    figure={MANUSCRIPT.FIGURES.ADMIN_MEMBER_DETAIL}
  />

  <div class="member-index">
    <div><span>Department</span><strong>{member.department}</strong></div>
    <div><span>Status</span><strong>{{ associate: "준회원", regular: "정회원", withdrawn: "탈퇴" }[member.status]}</strong></div>
    <div><span>Joined</span><strong>{member.joinedAt ? new Date(member.joinedAt).toLocaleDateString("ko-KR") : "기록 없음"}</strong></div>
    <div><span>Admin</span><strong>{member.isAdmin ? "Yes" : "No"}</strong></div>
  </div>

  {#if notice}
    <div class="notice" data-tone={notice.tone} role="status">
      <p>{notice.message}</p>
      <button aria-label="알림 닫기" onclick={() => (notice = null)}>×</button>
    </div>
  {/if}

  <MemberRecordSections {member} onresult={handleSection} />

  <div class="authority-grid">
    <section class="authority-section roles-section">
      <header>
        <div><p>04 · Term Roles</p><h2>학기별 직책</h2></div>
        <button class="paper-btn small" type="button" onclick={addRole}>직책 추가</button>
      </header>
      <form method="POST" action="?/setRoles" use:enhance={() => actionEnhancer("roles")}>
        <input type="hidden" name="roles" value={rolesAsLines} />
        <div class="role-editor">
          {#each roles as role, index (index)}
            <div class="role-row">
              <label>
                <span>학기</span>
                <input aria-label={`${index + 1}번째 직책 학기`} bind:value={role.term} placeholder="26-2" />
              </label>
              <label>
                <span>직책</span>
                <input aria-label={`${index + 1}번째 직책 이름`} bind:value={role.title} list="role-titles" placeholder="회장" />
              </label>
              <button class="remove-role" type="button" aria-label={`${index + 1}번째 직책 삭제`} onclick={() => removeRole(index)}>×</button>
            </div>
          {:else}
            <p class="empty-line">등록된 직책이 없습니다.</p>
          {/each}
        </div>
        <datalist id="role-titles">
          <option value="회장"></option>
          <option value="부회장"></option>
          <option value="학술부장"></option>
          <option value="총무"></option>
          <option value="홍보부장"></option>
        </datalist>
        {#if roleIssue}<p class="field-error" role="alert">{roleIssue}</p>{/if}
        <footer>
          <p>역할은 권한과 공개 회장단 표시의 단일 원천입니다.</p>
          <button class="paper-btn primary" disabled={processing === "roles"}>직책 저장</button>
        </footer>
      </form>
    </section>

    <section class="authority-section admin-section">
      <header><div><p>05 · Administrator</p><h2>관리자 권한</h2></div></header>
      <p>관리자 권한은 모든 관리자 라우트 접근을 허용합니다. 변경은 감사 기록 대상입니다.</p>
      <form method="POST" action="?/setAdmin" use:enhance={() => actionEnhancer("admin")}>
        <input type="hidden" name="isAdmin" value={member.isAdmin ? "false" : "true"} />
        <button
          class="paper-btn"
          class:danger={member.isAdmin}
          disabled={processing === "admin" || member.id === "dev-admin"}
          onclick={(event) => {
            if (member.isAdmin && !confirm("이 회원의 관리자 권한을 회수하시겠습니까?")) event.preventDefault();
          }}
        >{member.isAdmin ? "관리자 권한 회수" : "관리자 권한 부여"}</button>
      </form>
      {#if member.id === "dev-admin"}<p class="locked-note">현재 로그인한 관리자의 자기 권한 회수는 차단됩니다.</p>{/if}
    </section>

    <section class="authority-section contact-section">
      <header><div><p>06 · Public Contact</p><h2>공개 연락처 동의</h2></div></header>
      <form method="POST" action="?/updateMember" use:enhance={() => actionEnhancer("contact")}>
        <!-- ?/updateMember is the single contact authority: the current record
             fields ride along so the partial form cannot blank them. -->
        <input type="hidden" name="name" value={member.name} />
        <input type="hidden" name="department" value={member.department} />
        <input type="hidden" name="joinedAt" value={member.joinedAt ?? ""} />
        <input type="hidden" name="projectTitle" value={member.project?.title ?? ""} />
        <input type="hidden" name="projectUrl" value={member.project?.url ?? ""} />
        <input
          type="hidden"
          name="publicContact"
          value={contactStatus === "granted"
            ? [contactPhone.trim(), contactEmail.trim()].filter(Boolean).join(" · ")
            : ""}
        />
        <fieldset>
          <legend>공개 상태</legend>
          <label><input type="radio" value="granted" bind:group={contactStatus} /> 공개 승인</label>
          <label><input type="radio" value="revoked" bind:group={contactStatus} /> 공개 철회</label>
        </fieldset>
        {#if contactStatus === "granted"}
          <label class="paper-field">
            <span class="paper-label">공개 전화번호</span>
            <input bind:value={contactPhone} aria-invalid={!!contactIssues.phone} placeholder="010-1234-5678" />
            {#if contactIssues.phone}<span class="field-error">{contactIssues.phone}</span>{/if}
          </label>
          <label class="paper-field">
            <span class="paper-label">공개 이메일</span>
            <input type="email" bind:value={contactEmail} aria-invalid={!!contactIssues.email} placeholder="office@snumps.org" />
            {#if contactIssues.email}<span class="field-error">{contactIssues.email}</span>{/if}
          </label>
        {/if}
        {#if contactIssues._form}<p class="field-error">{contactIssues._form}</p>{/if}
        <aside>당사자 확인 후 승인합니다. 현재 학기의 회장·부회장 역할을 가진 회원만 공개 화면에 표시됩니다.</aside>
        <button class="paper-btn primary" disabled={processing === "contact"}>공개 상태 저장</button>
      </form>
    </section>

  </div>

  <footer class="page-footer"><a href="/admin/members" class="paper-btn">회원 목록</a></footer>
</article>

<style>
  .member-authority-paper { width: min(100%, 1180px); }
  .member-index { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 1rem; border: 1px solid var(--latex-rule); }
  .member-index div { display: grid; gap: 0.2rem; padding: 0.65rem 0.75rem; border-right: 1px solid var(--latex-rule); }
  .member-index div:last-child { border-right: 0; }
  .member-index span,
  .authority-section header p,
  .role-row label > span { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.58rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .member-index strong { font-size: 0.8rem; font-weight: 560; }
  .notice { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; padding: 0.65rem 0.75rem; border: 1px solid var(--latex-rule); border-left: 4px solid var(--latex-text); }
  .notice[data-tone="error"] { border-left-color: var(--latex-accent); color: var(--latex-accent); }
  .notice p { margin: 0; font-size: 0.8rem; }
  .notice button { border: 0; background: transparent; color: inherit; cursor: pointer; }
  .authority-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.65fr); gap: 0.8rem; align-items: start; }
  .authority-section { border: 1px solid var(--latex-rule); }
  .authority-section > header { display: flex; align-items: start; justify-content: space-between; gap: 0.7rem; padding: 0.7rem 0.8rem; border-bottom: 2px solid var(--latex-rule); }
  .authority-section header p,
  .authority-section h2,
  .authority-section > p { margin: 0; }
  .authority-section header p { color: var(--latex-accent); }
  .authority-section h2 { margin-top: 0.15rem; font-size: 1.05rem; font-weight: 570; }
  .roles-section { grid-row: span 2; }
  .roles-section form,
  .contact-section form { padding: 0.8rem; }
  .role-editor { display: grid; gap: 0.45rem; }
  .role-row { display: grid; grid-template-columns: 0.65fr 1fr auto; gap: 0.4rem; align-items: end; }
  .role-row label { display: grid; gap: 0.25rem; }
  .remove-role { width: 2.25rem; height: 2.25rem; border: 1px solid var(--latex-rule); background: transparent; color: var(--latex-accent); cursor: pointer; font-size: 1rem; }
  .empty-line { margin: 0; color: var(--latex-muted); font-size: 0.76rem; }
  .roles-section footer { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-top: 0.8rem; padding-top: 0.7rem; border-top: 1px solid var(--latex-rule); }
  .roles-section footer p,
  .admin-section > p,
  .locked-note { margin: 0; color: var(--latex-muted); font-size: 0.72rem; line-height: 1.55; }
  .field-error { display: block; margin: 0.4rem 0 0; color: var(--latex-accent); font-size: 0.72rem; font-weight: 650; }
  .admin-section > p,
  .admin-section form,
  .locked-note { margin: 0.8rem; }
  :global(.paper-btn.danger) { border-color: var(--latex-accent); color: var(--latex-accent); }
  .contact-section { grid-column: 1 / -1; }
  .contact-section form { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; align-items: end; }
  .contact-section fieldset { grid-column: 1 / -1; display: flex; gap: 1rem; margin: 0; padding: 0.65rem 0.75rem; border: 1px solid var(--latex-rule); }
  .contact-section legend { padding: 0 0.35rem; color: var(--latex-muted); font-size: 0.68rem; }
  .contact-section aside { padding: 0.65rem; border: 1px solid var(--latex-rule); color: var(--latex-muted); font-size: 0.72rem; line-height: 1.55; }
  .contact-section form > button { justify-self: end; }
  .page-footer { display: flex; margin-top: 1rem; padding-top: 0.8rem; border-top: 1px solid var(--latex-rule); }
  @media (max-width: 780px) {
    .member-index { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .member-index div:nth-child(2) { border-right: 0; }
    .member-index div:nth-child(-n + 2) { border-bottom: 1px solid var(--latex-rule); }
    .authority-grid { grid-template-columns: 1fr; }
    .roles-section,
    .contact-section { grid-column: auto; grid-row: auto; }
  }
  @media (max-width: 540px) {
    .role-row { grid-template-columns: 1fr auto; }
    .role-row label:nth-child(2) { grid-column: 1; }
    .role-row .remove-role { grid-column: 2; grid-row: 1 / span 2; align-self: stretch; height: auto; }
    .roles-section footer,
    .contact-section form { align-items: stretch; grid-template-columns: 1fr; flex-direction: column; }
    .contact-section fieldset,
    .contact-section aside { grid-column: auto; }
    .contact-section form > button { justify-self: stretch; width: 100%; }
  }
</style>
