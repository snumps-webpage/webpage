<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { preloadData } from "$app/navigation";
  import MemberActivityRecord from "./MemberActivityRecord.svelte";
  import type { PageData } from "../../routes/(public)/members/[id]/$types";

  let {
    member,
    onClose,
  }: {
    member: { id: string; name: string };
    onClose: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let data = $state<PageData | null>(null);
  let loading = $state(true);
  let message = $state("");
  let active = true;
  const href = $derived(`/members/${encodeURIComponent(member.id)}`);

  async function loadRecord() {
    loading = true;
    message = "";
    try {
      const result = await preloadData(href);
      if (!active) return;
      if (
        result.type === "loaded" &&
        result.status === 200 &&
        result.data.member
      ) {
        data = result.data as PageData;
      } else {
        message =
          result.type === "loaded" && result.status === 404
            ? "공개된 회원 기록을 찾을 수 없습니다."
            : "활동 기록을 불러오지 못했습니다. 다시 시도해 주세요.";
      }
    } catch {
      if (active)
        message = "활동 기록을 불러오지 못했습니다. 다시 시도해 주세요.";
    } finally {
      if (active) loading = false;
    }
  }

  onMount(() => {
    dialog.showModal();
    void loadRecord();
  });
  onDestroy(() => {
    active = false;
  });
</script>

<dialog
  bind:this={dialog}
  class="member-activity-dialog"
  aria-labelledby="member-activity-title"
  onclose={onClose}
>
  <header class="dialog-toolbar">
    <h2 id="member-activity-title">{member.name} · 활동 기록</h2>
    <button class="paper-btn small" type="button" onclick={() => dialog.close()}
      >닫기</button
    >
  </header>
  <div class="dialog-content" aria-busy={loading}>
    {#if loading}
      <p class="notice" role="status">활동 기록을 불러오는 중입니다.</p>
    {:else if message}
      <div class="notice" role="alert">
        <p>{message}</p>
        <button class="paper-btn" type="button" onclick={loadRecord}
          >다시 시도</button
        >
      </div>
    {:else if data}
      <MemberActivityRecord {data} embedded />
    {/if}
  </div>
  <footer><a {href} class="paper-btn small">회원 상세 페이지 열기</a></footer>
</dialog>

<style>
  .member-activity-dialog {
    width: min(880px, calc(100% - 2rem));
    max-width: none;
    max-height: calc(100dvh - 2rem);
    padding: 0;
    border: 1px solid var(--latex-rule);
    background: var(--latex-bg);
    color: var(--latex-text);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .member-activity-dialog::backdrop {
    background: rgb(0 0 0 / 45%);
  }
  .dialog-toolbar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.8rem 1rem;
    border-bottom: 1px solid var(--latex-rule);
    background: var(--latex-bg);
  }
  .dialog-toolbar h2 {
    margin: 0;
    font-size: 1rem;
  }
  .dialog-toolbar button {
    flex-shrink: 0;
    min-height: 44px;
  }
  .notice {
    padding: 1.2rem;
    color: var(--latex-muted);
  }
  footer {
    padding: 0 1rem 1rem;
  }
  @media (max-width: 720px) {
    .member-activity-dialog {
      width: calc(100% - 1rem);
      max-height: calc(100dvh - 1rem);
    }
  }
</style>
