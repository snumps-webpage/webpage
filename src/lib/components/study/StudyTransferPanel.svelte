<script lang="ts">
  import { enhance } from "$app/forms";
  import type {
    StudyManagementData,
    StudyMemberSummary,
    StudyOperationResult,
  } from "$lib/domain/studies";

  interface Props {
    pendingTransfer: StudyManagementData["pendingTransfer"];
    candidates: StudyMemberSummary[];
    canTransfer: boolean;
    onTransition: (result: StudyOperationResult) => void;
    onError: (message: string) => void;
  }

  let {
    pendingTransfer,
    candidates,
    canTransfer,
    onTransition,
    onError,
  }: Props = $props();
  let memberId = $state("");
  let processing = $state(false);

  function enhanceTransfer() {
    processing = true;
    return async ({ result }: { result: import("@sveltejs/kit").ActionResult }) => {
      processing = false;
      if (result.type === "success") {
        onTransition(result.data as StudyOperationResult);
        return;
      }
      const data = result.type === "failure" ? result.data as { error?: string } : null;
      onError(data?.error ?? "주최자 전달 제안을 처리하지 못했습니다.");
    };
  }
</script>

<section class="transfer-panel">
  <header>
    <div>
      <p>03 · Succession</p>
      <h2>주최자 전달</h2>
    </div>
    <span>상대방 수락 후 변경</span>
  </header>

  {#if pendingTransfer}
    <div class="pending-transfer">
      <div>
        <strong>{pendingTransfer.toMember.name}</strong>
        <p>{pendingTransfer.toMember.department} · 수락 대기 중</p>
        <time datetime={pendingTransfer.requestedAt}>{new Date(pendingTransfer.requestedAt).toLocaleString("ko-KR")}</time>
      </div>
      <form method="POST" action="?/cancelTransfer" use:enhance={enhanceTransfer}>
        <button class="paper-btn small" disabled={processing}>제안 철회</button>
      </form>
    </div>
  {:else if canTransfer}
    <form class="proposal-form" method="POST" action="?/proposeTransfer" use:enhance={enhanceTransfer}>
      <label class="paper-label" for="transfer-member">새 주최자</label>
      <div>
        <select id="transfer-member" name="memberId" bind:value={memberId} required>
          <option value="" disabled>현재 참여자 선택</option>
          {#each candidates as candidate (candidate.id)}
            <option value={candidate.id}>{candidate.name} · {candidate.department}</option>
          {/each}
        </select>
        <button class="paper-btn primary small" disabled={processing || !memberId}>전달 제안</button>
      </div>
      <p>현재 참여자에게만 제안할 수 있습니다. 수락 전까지 주최자 권한은 그대로 유지됩니다.</p>
    </form>
  {:else}
    <p class="disabled-note">종료된 스터디에서는 주최자를 변경할 수 없습니다.</p>
  {/if}
</section>

<style>
  .transfer-panel { margin-top: 0.9rem; border: 1px solid var(--latex-rule); }
  .transfer-panel > header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.75rem 0.85rem;
    border-bottom: 2px solid var(--latex-rule);
  }
  .transfer-panel header p,
  .transfer-panel h2,
  .pending-transfer p,
  .proposal-form p,
  .disabled-note { margin: 0; }
  .transfer-panel header p,
  .transfer-panel header span,
  time {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .transfer-panel header p { color: var(--latex-accent); }
  .transfer-panel h2 { margin-top: 0.15rem; font-size: 1.05rem; font-weight: 570; }
  .pending-transfer,
  .proposal-form { padding: 0.85rem; }
  .pending-transfer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .pending-transfer strong { font-size: 0.84rem; }
  .pending-transfer p,
  .proposal-form p,
  .disabled-note { color: var(--latex-muted); font-size: 0.74rem; line-height: 1.55; }
  .proposal-form > div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.45rem; margin-top: 0.35rem; }
  .proposal-form select { min-width: 0; }
  .proposal-form p { margin-top: 0.45rem; }
  .disabled-note { padding: 0.85rem; }
  @media (max-width: 560px) {
    .transfer-panel > header,
    .pending-transfer { align-items: stretch; flex-direction: column; }
    .proposal-form > div { grid-template-columns: 1fr; }
    .pending-transfer button,
    .proposal-form button { width: 100%; }
  }
</style>
