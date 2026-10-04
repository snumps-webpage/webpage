<script lang="ts">
  import { enhance } from "$app/forms";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import StudyRosterPanel from "$lib/components/study/StudyRosterPanel.svelte";
  import StudySessionTimeline from "$lib/components/study/StudySessionTimeline.svelte";
  import StudyTransferPanel from "$lib/components/study/StudyTransferPanel.svelte";
  import {
    isStudyClosed,
    nextStudyStatuses,
    STUDY_STATUS_LABELS,
    type StudyStatus,
  } from "$lib/domain/studies";
  import { MANUSCRIPT } from "$lib/constants";

  let { data } = $props();
  const study = $derived(data.study);
  const participants = $derived(data.participants);
  const pendingParticipants = $derived(data.pendingParticipants);
  const sessions = $derived(data.sessions);
  // §6-4 / #4/#20: finished and cancelled are terminal — every organizer
  // mutation locks with them (the server refuses too); attendance stays open.
  const canMutate = $derived(
    !isStudyClosed(study.status) && data.canParticipate,
  );
  // The one transition rule — the server enforces the same function.
  const nextStatuses = $derived(
    data.canParticipate ? nextStudyStatuses(study.status) : [],
  );
  const transferCandidates = $derived(
    data.members.filter((member) => !study.organizerIds.includes(member.id)),
  );
  let notice = $state<{ tone: "success" | "error"; message: string } | null>(
    null,
  );
  let statusProcessing = $state(false);

  const statusLabel = $derived(STUDY_STATUS_LABELS[study.status]);

  /** How each transition is offered — which ones exist is nextStudyStatuses'. */
  const TRANSITIONS: Record<
    StudyStatus,
    {
      label: string;
      tone: "primary" | "plain" | "danger";
      fallback: string;
      confirm?: string;
    }
  > = {
    recruiting: {
      label: "모집 다시 열기",
      tone: "plain",
      fallback: "스터디 상태를 변경하지 못했습니다.",
    },
    ongoing: {
      label: "진행 시작",
      tone: "primary",
      fallback: "스터디를 시작하지 못했습니다.",
    },
    finished: {
      label: "스터디 종료",
      tone: "danger",
      fallback: "스터디를 종료하지 못했습니다.",
      confirm:
        "스터디를 종료하면 새 회차를 만들거나 참여자를 변경할 수 없고, 대기 중인 참여 신청과 주최자 변경 제안은 사라집니다. 종료하시겠습니까?",
    },
    cancelled: {
      label: "스터디 취소",
      tone: "danger",
      fallback: "스터디를 취소하지 못했습니다.",
      confirm:
        "한 번도 진행하지 않은 스터디를 취소합니다. 취소한 스터디는 다시 열 수 없고, 대기 중인 참여 신청과 주최자 변경 제안은 사라집니다. 취소하시겠습니까?",
    },
  };

  function showError(message: string) {
    notice = { tone: "error", message };
  }

  function showNotice(message: string) {
    notice = { tone: "success", message };
  }

  function statusEnhancer(next: StudyStatus, fallback: string) {
    statusProcessing = true;
    return async ({
      result,
      update,
    }: {
      result: import("@sveltejs/kit").ActionResult;
      update: () => Promise<void>;
    }) => {
      statusProcessing = false;
      if (result.type === "redirect") {
        await update();
        return;
      }
      if (result.type === "success") {
        await update();
        showNotice(
          `스터디 상태를 ‘${STUDY_STATUS_LABELS[next]}’ 상태로 변경했습니다.`,
        );
        return;
      }
      const data =
        result.type === "failure"
          ? (result.data as {
              error?: string;
              message?: string;
              issues?: { status?: string };
            })
          : null;
      showError(
        data?.issues?.status ?? data?.message ?? data?.error ?? fallback,
      );
    };
  }
</script>

<svelte:head>
  <title>{study.title} 관리 · SNUMPS</title>
</svelte:head>

<article class="paper-document study-manage-paper">
  <ManuscriptHeader
    title={study.title}
    subtitle="Study Organizer Workspace"
    figure={MANUSCRIPT.FIGURES.STUDY_MANAGE}
  />

  <div class="study-index">
    <div>
      <span>Term</span><strong>{study.semester}</strong>
    </div>
    <div>
      <span>Status</span><strong>{statusLabel}</strong>
    </div>
    <div>
      <span>Members</span><strong>{participants.length}</strong>
    </div>
    <div>
      <span>Sessions</span><strong>{sessions.length}</strong>
    </div>
  </div>

  <section class="study-summary">
    <div>
      <p class="eyebrow">Study Abstract</p>
      <p>{study.description}</p>
      <dl>
        <div>
          <dt>교재</dt>
          <dd>{study.textbook}</dd>
        </div>
        <div>
          <dt>운영 메모</dt>
          <dd>{study.note}</dd>
        </div>
      </dl>
    </div>
    <div class="status-control">
      <span>Study State</span>
      {#each nextStatuses as next (next)}
        {@const transition = TRANSITIONS[next]}
        <form
          method="POST"
          action="?/setStudyStatus"
          use:enhance={() => statusEnhancer(next, transition.fallback)}
        >
          <input type="hidden" name="status" value={next} />
          <button
            class="paper-btn small"
            class:primary={transition.tone === "primary"}
            class:danger={transition.tone === "danger"}
            disabled={statusProcessing}
            onclick={(event) => {
              if (transition.confirm && !confirm(transition.confirm)) {
                event.preventDefault();
              }
            }}>{transition.label}</button
          >
        </form>
      {:else}
        <p>
          {#if !data.canParticipate}이번 학기 등록 전에는 주최자 화면을 열람할
            수 있습니다. 회차·참여자·출석 기록 변경은 등록 후 이용하세요.{:else}{study.status ===
            "cancelled"
              ? "취소된"
              : "종료된"} 스터디입니다. 회차와 참여자 변경이 잠겼고, 출석부 정정만
            할 수 있습니다.{/if}
        </p>
      {/each}
    </div>
  </section>

  {#if notice}
    <div class="notice" data-tone={notice.tone} role="status">
      <p>{notice.message}</p>
      <button aria-label="알림 닫기" onclick={() => (notice = null)}>×</button>
    </div>
  {/if}

  <div class="management-grid">
    <StudySessionTimeline
      studyId={study.id}
      {sessions}
      canEdit={canMutate}
      onNotice={showNotice}
      onError={showError}
    />
    <StudyRosterPanel
      {pendingParticipants}
      {participants}
      organizerIds={study.organizerIds}
      canManage={canMutate}
      onNotice={showNotice}
      onError={showError}
    />
  </div>

  <StudyTransferPanel
    pendingTransfer={study.pendingTransfer}
    candidates={transferCandidates}
    canTransfer={canMutate}
    onNotice={showNotice}
    onError={showError}
  />

  <footer>
    <a href="/study" class="paper-btn">스터디 목록</a>
    <span>데이터 기준 {new Date(data.generatedAt).toLocaleString("ko-KR")}</span
    >
  </footer>
</article>

<style>
  .study-manage-paper {
    width: min(100%, 1320px);
  }

  .study-index {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-bottom: 1rem;
    border: 1px solid var(--latex-rule);
  }

  .study-index div {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.65rem 0.8rem;
    border-right: 1px solid var(--latex-rule);
  }

  .study-index div:last-child {
    border-right: 0;
  }

  .study-index span,
  .status-control > span,
  dt,
  .eyebrow {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .study-index strong {
    font-family: var(--font-math);
    font-size: 1rem;
    font-weight: 550;
  }

  .study-summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    margin-bottom: 1rem;
    padding: 0.9rem;
    border: 1px solid var(--latex-rule);
  }

  .study-summary p,
  dl,
  dd {
    margin: 0;
  }

  .study-summary > div:first-child > p:not(.eyebrow) {
    margin-top: 0.3rem;
    font-size: 0.86rem;
    line-height: 1.65;
  }

  dl {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.65rem;
  }

  dl div {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr);
    gap: 0.5rem;
  }

  dd {
    font-size: 0.78rem;
  }

  .status-control {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.35rem;
    max-width: 24rem;
    padding-left: 1rem;
    border-left: 1px solid var(--latex-rule);
  }

  .status-control form {
    margin: 0;
  }

  .status-control p {
    max-width: 18rem;
    color: var(--latex-muted);
    font-size: 0.74rem;
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

  .notice button {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 1.05rem;
  }

  .management-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(20rem, 0.75fr);
    gap: 0.9rem;
    align-items: start;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 1rem;
    padding-top: 0.8rem;
    border-top: 1px solid var(--latex-rule);
  }

  footer span {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.6rem;
  }

  @media (max-width: 980px) {
    .management-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .study-index {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .study-index div:nth-child(2) {
      border-right: 0;
    }

    .study-index div:nth-child(-n + 2) {
      border-bottom: 1px solid var(--latex-rule);
    }

    .study-summary {
      grid-template-columns: 1fr;
    }

    .status-control {
      justify-content: stretch;
      max-width: none;
      padding: 0.8rem 0 0;
      border-top: 1px solid var(--latex-rule);
      border-left: 0;
    }

    .status-control form,
    .status-control button {
      width: 100%;
    }

    footer {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
