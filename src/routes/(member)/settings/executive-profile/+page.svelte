<script lang="ts">
  import ExecutiveProfileEditor from "$lib/components/ExecutiveProfileEditor.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import AccountSettingsNav from "$lib/components/account/AccountSettingsNav.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import type { ExecutiveProfileFormFailure } from "$lib/domain/executive-profile";

  let { data, form } = $props();
  const editor = $derived(data.editor);
  const failure = $derived(
    form?.error === "VALIDATION_FAILED"
      ? (form as unknown as ExecutiveProfileFormFailure)
      : null,
  );
</script>

<svelte:head>
  <title>공개 프로필 · SNUMPS</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<article class="paper-document settings-paper">
  <ManuscriptHeader
    title="회원 설정"
    subtitle="Executive Public Profile"
    figure={MANUSCRIPT.FIGURES.EXECUTIVE_PROFILE}
  />
  <AccountSettingsNav current="executive-profile" />

  <p class="intro">
    <a href="/about/executives">역대 회장단</a> 페이지의 내 카드에 무엇을 보일지
    고릅니다. <strong>회원 정보 사용</strong>은 회원 기록의 값을 그대로 보여
    주며, 회원 정보가 바뀌면 함께 바뀝니다. 학번은 입학년도만 공개됩니다.
    처음에는 모두 비공개입니다.
  </p>
  <p class="terms">
    {#each editor.roles as role, i (`${role.term}-${role.title}`)}{i > 0
        ? " · "
        : ""}{role.term}
      {role.title}{/each}
  </p>

  {#if form?.success}
    <p class="result-note" role="status">공개 프로필을 저장했습니다.</p>
  {:else if form?.error && !failure}
    <p class="result-note error" role="alert">
      {form.message ?? "저장하지 못했습니다. 다시 시도해 주세요."}
    </p>
  {/if}

  {#if editor.withdrawn}
    <p class="result-note" role="note">
      탈퇴 처리 중입니다. 역대 회장단의 자리에는 탈퇴하면서 남기기로 한 항목이
      표시되며, 변경이 필요하면 관리자에게 요청해 주세요. 탈퇴를 철회하면 이
      화면의 설정이 다시 적용됩니다.
    </p>
  {:else}
    {#key `${editor.memberId}:${JSON.stringify(editor.settings)}`}
      <ExecutiveProfileEditor
        settings={editor.settings}
        linked={editor.linked}
        {failure}
      />
    {/key}
  {/if}
</article>

<style>
  .settings-paper {
    width: min(100%, 50rem);
  }
  .intro {
    margin: 0 0 0.35rem;
    color: var(--latex-muted);
    font-size: 0.8rem;
    line-height: 1.7;
  }
  .intro a {
    color: var(--latex-text);
  }
  .terms {
    margin: 0 0 0.85rem;
    color: var(--latex-accent);
    font: 700 0.62rem/1.4 var(--font-mono);
    letter-spacing: 0.06em;
  }
  .result-note {
    margin: 0 0 0.8rem;
    padding: 0.65rem 0.75rem;
    border-left: 4px solid var(--latex-text);
    background: color-mix(in srgb, var(--latex-rule) 12%, transparent);
    font-size: 0.78rem;
  }
  .result-note.error {
    border-color: var(--color-danger-text);
    color: var(--color-danger-text);
  }
</style>
