<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type {
    StudyMemberSummary,
    StudyOperationResult,
  } from "$lib/domain/studies";

  interface Props {
    pendingParticipants: StudyMemberSummary[];
    participants: StudyMemberSummary[];
    organizerIds: string[];
    canManage: boolean;
    onTransition: (result: StudyOperationResult) => void;
    onError: (message: string) => void;
  }

  let {
    pendingParticipants,
    participants,
    organizerIds,
    canManage,
    onTransition,
    onError,
  }: Props = $props();

  let processingMemberId = $state<string | null>(null);

  function submitMember(memberId: string, fallback: string): SubmitFunction {
    return () => {
      processingMemberId = memberId;
      return async ({ result }) => {
        processingMemberId = null;
        if (result.type === "success") {
          onTransition(result.data as StudyOperationResult);
          return;
        }
        const data = "data" in result ? result.data as { error?: string } : null;
        onError(data?.error ?? fallback);
      };
    };
  }
</script>

<section class="roster-panel" aria-labelledby="roster-heading">
  <header class="section-heading">
    <div>
      <p>Roster · Participant Control</p>
      <h2 id="roster-heading">참여자 관리</h2>
    </div>
    <span>{participants.length}명</span>
  </header>

  <div class="roster-block pending-block">
    <div class="block-heading">
      <h3>참여 대기</h3>
      <span>{pendingParticipants.length}</span>
    </div>
    <div class="member-list">
      {#each pendingParticipants as member (member.id)}
        <article class="member-row pending-row">
          <div>
            <strong>{member.name}</strong>
            <span>{member.department}</span>
          </div>
          {#if canManage}
            <div class="row-actions">
              <form
                method="POST"
                action="?/acceptParticipant"
                use:enhance={submitMember(member.id, "참여 신청을 수락하지 못했습니다.")}
              >
                <input type="hidden" name="memberId" value={member.id} />
                <button class="paper-btn primary small" disabled={processingMemberId === member.id}>
                  수락
                </button>
              </form>
              <form
                method="POST"
                action="?/removeParticipant"
                use:enhance={submitMember(member.id, "참여 신청을 거절하지 못했습니다.")}
              >
                <input type="hidden" name="memberId" value={member.id} />
                <button class="paper-btn small" disabled={processingMemberId === member.id}>
                  거절
                </button>
              </form>
            </div>
          {/if}
        </article>
      {:else}
        <p class="empty-line">대기 중인 신청이 없습니다.</p>
      {/each}
    </div>
  </div>

  <div class="roster-block">
    <div class="block-heading">
      <h3>현재 참여자</h3>
      <span>{participants.length}</span>
    </div>
    <div class="member-list">
      {#each participants as member (member.id)}
        <article class="member-row">
          <div>
            <strong>{member.name}</strong>
            <span>{member.department}</span>
          </div>
          {#if organizerIds.includes(member.id)}
            <span class="role-mark">Organizer</span>
          {:else if canManage}
            <form
              method="POST"
              action="?/removeParticipant"
              use:enhance={submitMember(member.id, "참여자를 제외하지 못했습니다.")}
            >
              <input type="hidden" name="memberId" value={member.id} />
              <button
                class="text-action"
                disabled={processingMemberId === member.id}
                onclick={(event) => {
                  if (!confirm(`${member.name} 님을 참여자에서 제외하시겠습니까?`)) {
                    event.preventDefault();
                  }
                }}
              >제외</button>
            </form>
          {/if}
        </article>
      {/each}
    </div>
  </div>
</section>

<style>
  .roster-panel {
    min-width: 0;
    border: 1px solid var(--latex-rule);
  }

  .section-heading,
  .block-heading,
  .member-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .section-heading {
    padding: 0.85rem 1rem;
    border-bottom: 2px solid var(--latex-rule);
  }

  .section-heading p {
    margin: 0 0 0.2rem;
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 1.2rem;
    font-weight: 560;
  }

  .section-heading > span,
  .block-heading span,
  .role-mark {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .section-heading > span {
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--latex-rule);
  }

  .roster-block + .roster-block {
    border-top: 1px solid var(--latex-rule);
  }

  .block-heading {
    padding: 0.6rem 0.8rem;
    background: color-mix(in srgb, var(--latex-text) 3%, transparent);
  }

  .block-heading h3 {
    font-size: 0.82rem;
    font-weight: 650;
  }

  .member-row {
    min-height: 3.5rem;
    padding: 0.65rem 0.8rem;
    border-top: 1px solid color-mix(in srgb, var(--latex-rule) 25%, transparent);
  }

  .member-row > div:first-child {
    display: grid;
    min-width: 0;
  }

  .member-row strong {
    font-size: 0.88rem;
  }

  .member-row span {
    color: var(--latex-muted);
    font-size: 0.72rem;
  }

  .pending-row {
    border-left: 3px solid var(--latex-accent);
  }

  .row-actions {
    display: flex;
    gap: 0.3rem;
  }

  form {
    margin: 0;
  }

  .role-mark {
    color: var(--latex-accent) !important;
  }

  .text-action {
    min-height: 2.5rem;
    border: 0;
    background: transparent;
    color: var(--latex-accent);
    cursor: pointer;
    font-size: 0.68rem;
    text-decoration: underline;
    text-underline-offset: 0.2rem;
  }

  .empty-line {
    padding: 1rem 0.8rem;
    color: var(--latex-muted);
    font-size: 0.78rem;
  }

  @media (max-width: 520px) {
    .pending-row {
      align-items: start;
      flex-direction: column;
    }

    .row-actions,
    .row-actions form,
    .row-actions button {
      width: 100%;
    }
  }
</style>
