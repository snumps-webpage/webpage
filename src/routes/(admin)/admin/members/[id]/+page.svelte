<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import { tick, untrack } from "svelte";
  import MemberRecordSections from "$lib/components/admin/MemberRecordSections.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import {
    memberAdminNotice,
    memberRolesText,
    scopedMemberAction,
    type AdminMemberActionState,
    type AdminMemberOperation,
  } from "$lib/domain/admin-member-editor";
  import { MANUSCRIPT } from "$lib/constants";

  let { data, form } = $props();
  const member = $derived(data.member);
  const actionState = $derived(
    scopedMemberAction(form as AdminMemberActionState | null, member.id),
  );
  const initial = untrack(() => ({
    id: member.id,
    state: actionState,
    roles:
      actionState?.operation === "rolesUpdated" && actionState.values
        ? (actionState.values.roles ?? "")
        : memberRolesText(member),
  }));
  let roles = $state(initial.roles);
  let scope = initial.id;
  let seen = initial.state;
  let pending = $state<{
    token: symbol;
    memberId: string;
    operation: AdminMemberOperation;
  } | null>(null);
  let transient = $state<{ tone: "error"; message: string } | null>(null);
  const busy = $derived(pending !== null);
  const notice = $derived(transient ?? memberAdminNotice(actionState, member));
  const roleIssue = $derived(
    actionState?.operation === "rolesUpdated"
      ? actionState.issues?.roles
      : null,
  );

  $effect(() => {
    const current = member;
    const state = actionState;
    untrack(() => {
      if (current.id !== scope) {
        scope = current.id;
        roles = memberRolesText(current);
        pending = null;
        transient = null;
      }
      if (state !== seen) {
        if (state?.operation === "rolesUpdated") {
          roles = state.success
            ? memberRolesText(current)
            : (state.values?.roles ?? roles);
        }
        seen = state;
      }
    });
  });

  function submit(operation: AdminMemberOperation): SubmitFunction {
    return ({ cancel, formElement }) => {
      if (pending) {
        cancel();
        return;
      }
      const request = { token: Symbol(), memberId: member.id, operation };
      pending = request;
      transient = null;
      return async ({ result, update }) => {
        try {
          if (
            member.id !== request.memberId ||
            pending?.token !== request.token
          )
            return;
          if (result.type === "success") await update({ reset: false });
          else if (result.type === "failure")
            await update({ reset: false, invalidateAll: false });
          else if (result.type === "redirect") {
            await update();
            return;
          } else
            transient = {
              tone: "error",
              message:
                "저장 결과를 확인하지 못했습니다. 새로고침해 현재 상태를 확인해 주세요.",
            };
        } catch {
          if (member.id === request.memberId)
            transient = {
              tone: "error",
              message:
                "저장 후 상태를 확인하지 못했습니다. 새로고침해 확인해 주세요.",
            };
        } finally {
          if (pending?.token === request.token) pending = null;
        }
        await tick();
        if (member.id === request.memberId && !pending) {
          const invalid = formElement.querySelector<HTMLElement>(
            '[aria-invalid="true"]',
          );
          (
            invalid ??
            document.querySelector<HTMLElement>("[data-member-result]")
          )?.focus();
        }
      };
    };
  }
</script>

<svelte:head><title>{member.name} 권한 기록 · SNUMPS 관리자</title></svelte:head
>

<article class="paper-document member-authority-paper">
  <ManuscriptHeader
    title={member.name}
    subtitle="Member Authority Record"
    figure={MANUSCRIPT.FIGURES.ADMIN_MEMBER_DETAIL}
  />

  <div class="member-index">
    <div><span>Department</span><strong>{member.department}</strong></div>
    <div>
      <span>Status</span><strong
        >{{ associate: "준회원", regular: "정회원", withdrawn: "탈퇴" }[
          member.status
        ]}</strong
      >
    </div>
    <div>
      <span>Joined</span><strong
        >{member.joinedAt
          ? new Date(member.joinedAt).toLocaleDateString("ko-KR")
          : "기록 없음"}</strong
      >
    </div>
    <div>
      <span>Admin</span><strong>{member.isAdmin ? "Yes" : "No"}</strong>
    </div>
  </div>

  {#if notice}
    <div
      class="notice"
      data-tone={notice.tone}
      data-member-result
      tabindex="-1"
      role={notice.tone === "error" ? "alert" : "status"}
    >
      <p>{notice.message}</p>
    </div>
  {/if}

  {#key member.id}<MemberRecordSections
      {member}
      {actionState}
      {busy}
      {submit}
    />{/key}

  <div class="authority-grid">
    <section class="authority-section roles-section">
      <header>
        <div>
          <p>04 · Term Roles</p>
          <h2>학기별 직책</h2>
        </div>
      </header>
      <form
        method="POST"
        action="?/setRoles"
        use:enhance={submit("rolesUpdated")}
        aria-busy={busy}
      >
        <label class="paper-field">
          <span class="paper-label">학기와 직책</span>
          <textarea
            name="roles"
            rows="5"
            bind:value={roles}
            disabled={busy}
            aria-invalid={!!roleIssue}
            aria-describedby="roles-help roles-error"
            spellcheck="false"></textarea>
        </label>
        <p id="roles-help" class="field-note">
          한 줄에 하나씩 ‘26-2 회장’처럼 입력합니다. 빈 칸으로 저장하면 모든
          직책이 해제됩니다.
        </p>
        <p id="roles-error" class="field-error">{roleIssue ?? ""}</p>
        {#if data.roleTitles.length}<p class="field-note">
            등록된 직책: {data.roleTitles.join(" · ")}
          </p>{/if}
        <footer>
          <p>
            권한과 공개 회장단 표시의 원본입니다. 저장한 변경은 감사 기록에
            남습니다.
          </p>
          <button class="paper-btn primary" disabled={busy}>직책 저장</button>
        </footer>
      </form>
    </section>

    <section class="authority-section admin-section">
      <header>
        <div>
          <p>05 · Administrator</p>
          <h2>관리자 권한</h2>
        </div>
      </header>
      <p>
        관리자 권한은 모든 관리자 라우트 접근을 허용합니다. 변경은 감사 기록
        대상입니다.
      </p>
      <form
        method="POST"
        action="?/setAdmin"
        use:enhance={submit("adminUpdated")}
      >
        <input
          type="hidden"
          name="isAdmin"
          value={member.isAdmin ? "false" : "true"}
        />
        <button
          class="paper-btn"
          class:danger={member.isAdmin}
          disabled={busy || data.isSelf}
          onclick={(event) => {
            if (
              member.isAdmin &&
              !confirm("이 회원의 관리자 권한을 회수하시겠습니까?")
            )
              event.preventDefault();
          }}>{member.isAdmin ? "관리자 권한 회수" : "관리자 권한 부여"}</button
        >
      </form>
      {#if data.isSelf}<p class="locked-note">
          현재 로그인한 관리자의 자기 권한 회수는 차단됩니다.
        </p>{/if}
    </section>
  </div>

  <footer class="page-footer">
    <a href="/admin/members" class="paper-btn">회원 목록</a>
  </footer>
</article>

<style>
  .member-authority-paper {
    width: min(100%, 1180px);
  }
  .member-index {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-bottom: 1rem;
    border: 1px solid var(--latex-rule);
  }
  .member-index div {
    display: grid;
    gap: 0.2rem;
    padding: 0.65rem 0.75rem;
    border-right: 1px solid var(--latex-rule);
  }
  .member-index div:last-child {
    border-right: 0;
  }
  .member-index span,
  .authority-section header p {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .member-index strong {
    font-size: 0.8rem;
    font-weight: 560;
  }
  .notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--latex-rule);
    border-left: 4px solid var(--latex-text);
  }
  .notice[data-tone="error"] {
    border-left-color: var(--latex-accent);
    color: var(--latex-accent);
  }
  .notice p {
    margin: 0;
    font-size: 0.8rem;
  }
  .authority-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.65fr);
    gap: 0.8rem;
    align-items: start;
  }
  .authority-section {
    border: 1px solid var(--latex-rule);
  }
  .authority-section > header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.7rem;
    padding: 0.7rem 0.8rem;
    border-bottom: 2px solid var(--latex-rule);
  }
  .authority-section header p,
  .authority-section h2,
  .authority-section > p {
    margin: 0;
  }
  .authority-section header p {
    color: var(--latex-accent);
  }
  .authority-section h2 {
    margin-top: 0.15rem;
    font-size: 1.05rem;
    font-weight: 570;
  }
  .roles-section {
    grid-row: span 2;
  }
  .roles-section form {
    padding: 0.8rem;
  }
  .field-note {
    color: var(--latex-muted);
    font-size: 0.72rem;
    line-height: 1.55;
  }
  .roles-section textarea {
    font-family: var(--font-mono);
  }
  .roles-section footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 0.8rem;
    padding-top: 0.7rem;
    border-top: 1px solid var(--latex-rule);
  }
  .roles-section footer p,
  .admin-section > p,
  .locked-note {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.72rem;
    line-height: 1.55;
  }
  .field-error {
    display: block;
    margin: 0.4rem 0 0;
    color: var(--latex-accent);
    font-size: 0.72rem;
    font-weight: 650;
  }
  .admin-section > p,
  .admin-section form,
  .locked-note {
    margin: 0.8rem;
  }
  .page-footer {
    display: flex;
    margin-top: 1rem;
    padding-top: 0.8rem;
    border-top: 1px solid var(--latex-rule);
  }
  @media (max-width: 780px) {
    .member-index {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .member-index div:nth-child(2) {
      border-right: 0;
    }
    .member-index div:nth-child(-n + 2) {
      border-bottom: 1px solid var(--latex-rule);
    }
    .authority-grid {
      grid-template-columns: 1fr;
    }
    .roles-section {
      grid-column: auto;
      grid-row: auto;
    }
  }
  @media (max-width: 540px) {
    .roles-section footer {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
