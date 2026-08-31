<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";

  let { data } = $props();
  const templates = $derived(data.templates);

  let openKey = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);

  function submitAndRefresh(message: string) {
    return () =>
      async ({ result, update }: { result: { type: string; data?: { message?: string } }; update: () => Promise<void> }) => {
        if (result.type === "success") {
          notice = message;
          errorMessage = null;
          openKey = null;
          await invalidateAll();
        } else {
          errorMessage = result.data?.message ?? "처리하지 못했습니다.";
          await update();
        }
      };
  }
</script>

<svelte:head><title>자동 메일 관리 · SNUMPS Admin</title></svelte:head>

<article class="paper-document mail-paper">
  <ManuscriptHeader title="자동 메일 관리" subtitle="Automated Mail Templates" figure={MANUSCRIPT.FIGURES.ADMIN} />
  <AdminSectionNav />
  <p class="scope-note">
    자동 전송 메일의 제목·본문을 편집하고 발송을 켜거나 끕니다. 기본 문구는 코드에 보존되며,
    여기서의 수정은 덮어쓰기 계층입니다 — <strong>기본값 복원</strong>은 수정을 삭제하고 원래 문구로 되돌립니다.
    본문에서 <code>{"{{변수}}"}</code> 표기는 발송 시 실제 값으로 치환됩니다.
  </p>

  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}

  <ul class="template-list">
    {#each templates as t (t.key)}
      <li class:disabled={!t.enabled}>
        <header>
          <div>
            <h2>{t.name}</h2>
            <p class="description">{t.description}</p>
          </div>
          <div class="badges">
            {#if t.customized}<span class="badge customized">수정됨</span>{:else}<span class="badge">기본값</span>{/if}
            {#if !t.enabled}<span class="badge off">발송 꺼짐</span>{/if}
          </div>
        </header>

        {#if openKey === t.key}
          <form method="POST" action="?/save" use:enhance={submitAndRefresh(`'${t.name}' 저장됨`)}>
            <input type="hidden" name="key" value={t.key} />
            <label>
              <span class="paper-label">제목</span>
              <input type="text" name="subject" value={t.subject} required />
            </label>
            <label>
              <span class="paper-label">본문</span>
              <textarea name="body" rows="10" required>{t.body}</textarea>
            </label>
            <p class="variables">사용 가능한 변수: {#each t.variables as v (v)}<code>{"{{" + v + "}}"}</code>{/each}</p>
            <label class="enabled-toggle">
              <input type="checkbox" name="enabled" checked={t.enabled} /> 발송 활성화
            </label>
            <div class="row-actions">
              <button type="submit" class="paper-btn primary">저장</button>
              <button type="button" class="paper-btn" onclick={() => (openKey = null)}>닫기</button>
            </div>
          </form>
        {:else}
          <p class="subject-preview"><span class="paper-label">제목</span> {t.subject}</p>
          <div class="row-actions">
            <button type="button" class="paper-btn" onclick={() => (openKey = t.key)}>편집</button>
            <form method="POST" action="?/toggle" use:enhance={submitAndRefresh(t.enabled ? `'${t.name}' 발송 끔` : `'${t.name}' 발송 켬`)}>
              <input type="hidden" name="key" value={t.key} />
              <input type="hidden" name="enabled" value={t.enabled ? "false" : "true"} />
              <button type="submit" class="paper-btn">{t.enabled ? "발송 끄기" : "발송 켜기"}</button>
            </form>
            {#if t.customized}
              <form method="POST" action="?/reset" use:enhance={submitAndRefresh(`'${t.name}' 기본값 복원`)}>
                <input type="hidden" name="key" value={t.key} />
                <button type="submit" class="paper-btn danger">기본값 복원</button>
              </form>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</article>

<style>
  .mail-paper { width: min(100%, 880px); }
  .scope-note { margin: 0 0 1rem; color: var(--latex-muted); font-size: 0.78rem; line-height: 1.7; }
  .notice { padding: 0.5rem 0.7rem; border: 1px solid var(--latex-rule); font-size: 0.78rem; }
  .error { padding: 0.5rem 0.7rem; border: 1px solid var(--color-danger-text, #b00); color: var(--color-danger-text, #b00); font-size: 0.78rem; }
  .template-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.8rem; }
  li { padding: 0.9rem; border: 1px solid var(--latex-rule); }
  li.disabled { opacity: 0.65; }
  li > header { display: flex; justify-content: space-between; gap: 0.8rem; align-items: start; }
  h2 { margin: 0; font-size: 0.95rem; font-weight: 600; }
  .description { margin: 0.2rem 0 0; color: var(--latex-muted); font-size: 0.72rem; }
  .badges { display: flex; gap: 0.35rem; flex-shrink: 0; }
  .badge { padding: 0.15rem 0.45rem; border: 1px solid var(--latex-rule); color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.55rem; text-transform: uppercase; }
  .badge.customized { border-color: var(--latex-accent); color: var(--latex-accent); }
  .badge.off { background: var(--latex-text); border-color: var(--latex-text); color: var(--latex-bg); }
  .subject-preview { margin: 0.6rem 0 0; font-size: 0.8rem; }
  .subject-preview .paper-label { margin-right: 0.4rem; }
  form label { display: block; margin-top: 0.7rem; }
  input[type="text"], textarea { width: 100%; margin-top: 0.25rem; padding: 0.5rem 0.6rem; font-size: 0.8rem; }
  textarea { font-family: inherit; line-height: 1.65; resize: vertical; }
  .variables { margin: 0.5rem 0 0; color: var(--latex-muted); font-size: 0.68rem; }
  .variables code { margin-right: 0.35rem; font-size: 0.9em; }
  .enabled-toggle { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.6rem; font-size: 0.78rem; }
  .row-actions { display: flex; gap: 0.5rem; margin-top: 0.7rem; flex-wrap: wrap; }
  .row-actions form { margin: 0; }
  .paper-btn.danger { border-color: var(--color-danger-text, #b00); color: var(--color-danger-text, #b00); }
</style>
