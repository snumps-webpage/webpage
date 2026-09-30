<script lang="ts">
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import ExecutiveProfileEditor from "$lib/components/ExecutiveProfileEditor.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import type { ExecutiveProfileFormFailure } from "$lib/domain/executive-profile";

  let { data, form } = $props();
  const editor = $derived(data.editor);
  const failure = $derived(
    form?.error === "VALIDATION_FAILED"
      ? (form as unknown as ExecutiveProfileFormFailure)
      : null,
  );
  const roleText = (roles: { term: string; title: string }[]) =>
    roles.map((r) => `${r.term} ${r.title}`).join(" · ");
</script>

<svelte:head><title>회장단 공개 프로필 · SNUMPS Admin</title></svelte:head>

<article class="paper-document profiles-paper">
  <ManuscriptHeader
    title="회장단 공개 프로필"
    subtitle="Executive Profile Ledger"
    figure={MANUSCRIPT.FIGURES.ADMIN_EXECUTIVE_PROFILES}
  />
  <AdminSectionNav />
  <p class="scope-note">
    역대 회장·부회장이 <a href="/about/executives">역대 회장단</a> 페이지에 보일
    학과·학번·이메일·근황을 대신 입력합니다. 로그인하지 않는 옛 회장단도
    여기서만 채울 수 있습니다. 본인은 회원 설정의
    <strong>공개 프로필</strong>에서 직접 고칠 수 있으며, 저장은 감사 로그에
    남습니다(값은 남기지 않음).
    <a href="/admin/executives">← 임원진 배정</a>
  </p>

  <div class="layout">
    <nav class="candidates" aria-label="역대 회장·부회장">
      {#each data.candidates as c (c.id)}
        <a
          href={`?member=${encodeURIComponent(c.id)}`}
          aria-current={editor?.memberId === c.id ? "page" : undefined}
        >
          <span class="name">
            {c.name}
            {#if c.legacyOnly}<small class="tag">이주 기록</small>{/if}
            {#if c.withdrawn}<small class="tag">탈퇴</small>{/if}
          </span>
          <span class="roles">{roleText(c.roles)}</span>
          <span class="state" class:set={c.hasProfile}>
            {c.hasProfile ? "설정됨" : "미설정"}
          </span>
        </a>
      {:else}
        <p class="empty">회장·부회장 기록이 없습니다.</p>
      {/each}
    </nav>

    <section class="editor-pane">
      {#if editor}
        <h2>{editor.name}</h2>
        <p class="roles">{roleText(editor.roles)}</p>
        {#if form?.success}
          <p class="notice" role="status">저장했습니다.</p>
        {:else if form?.error && !failure}
          <p class="error" role="alert">
            {form.message ?? "저장하지 못했습니다."}
          </p>
        {/if}
        {#if editor.withdrawn}
          <p class="withdrawn-note">
            <strong>탈퇴한 회원입니다.</strong> 역대 회장단의 자리에는 탈퇴하면서
            남기기로 한 값이 적혀 있습니다(탈퇴 시점 스냅숏). 여기서 고치면 그 자리에
            바로 반영됩니다.
          </p>
          {#key `${editor.memberId}:${JSON.stringify(editor.afterWithdrawal)}`}
            <ExecutiveProfileEditor
              mode="withdrawn"
              settings={editor.afterWithdrawal}
              memberId={editor.memberId}
              {failure}
            />
          {/key}
        {:else}
          {#key `${editor.memberId}:${JSON.stringify(editor.settings)}`}
            <ExecutiveProfileEditor
              settings={editor.settings}
              linked={editor.linked}
              memberId={editor.memberId}
              {failure}
            />
          {/key}
        {/if}
      {:else if data.selected}
        <p class="empty">
          목록에 없는 회원입니다 — 회장·부회장 이력이 있는 사람만 공개 프로필을
          둘 수 있습니다.
        </p>
      {:else}
        <p class="empty">왼쪽 목록에서 편집할 사람을 고르세요.</p>
      {/if}
    </section>
  </div>
</article>

<style>
  .profiles-paper {
    width: min(100%, 1040px);
  }
  .scope-note {
    margin: 0 0 1rem;
    color: var(--latex-muted);
    font-size: 0.8rem;
    line-height: 1.7;
  }
  .scope-note a {
    color: var(--latex-text);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 18rem) minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }
  .candidates {
    display: grid;
    border: 1px solid var(--latex-rule);
    max-height: 70vh;
    overflow-y: auto;
  }
  .candidates a {
    display: grid;
    gap: 0.2rem;
    padding: 0.6rem 0.75rem;
    color: var(--latex-text);
    text-decoration: none;
  }
  .candidates a + a {
    border-top: 1px solid var(--latex-rule);
  }
  .candidates a[aria-current="page"] {
    background: var(--latex-text);
    color: var(--latex-bg);
  }
  .candidates a[aria-current="page"] .roles,
  .candidates a[aria-current="page"] .state {
    color: inherit;
  }
  .name {
    font-size: 0.86rem;
    font-weight: 560;
  }
  .tag {
    margin-left: 0.3rem;
    font: 700 0.55rem/1 var(--font-mono);
    letter-spacing: 0.05em;
    opacity: 0.75;
  }
  .roles {
    margin: 0;
    color: var(--latex-muted);
    font: 0.64rem/1.4 var(--font-mono);
  }
  .state {
    color: var(--latex-muted);
    font: 700 0.58rem/1 var(--font-mono);
  }
  .state.set {
    color: var(--latex-accent);
  }
  .editor-pane h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 570;
  }
  .editor-pane > .roles {
    margin: 0.2rem 0 0.8rem;
  }
  .withdrawn-note {
    margin: 0 0 0.75rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--latex-accent);
    border-left-width: 4px;
    font-size: 0.76rem;
    line-height: 1.6;
  }
  .notice,
  .error {
    margin: 0 0 0.7rem;
    padding: 0.55rem 0.7rem;
    border-left: 4px solid var(--latex-text);
    font-size: 0.78rem;
  }
  .error {
    border-color: var(--color-danger-text);
    color: var(--color-danger-text);
  }
  .empty {
    margin: 0;
    padding: 1.2rem;
    border: 1px dashed var(--latex-rule);
    color: var(--latex-muted);
    font-size: 0.8rem;
    text-align: center;
  }
  @media (max-width: 760px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .candidates {
      max-height: 40vh;
    }
  }
</style>
