<script lang="ts">
  import { enhance } from "$app/forms";
  import { STUDY_STATUS_LABELS, isStudyClosed } from "$lib/domain/studies";
  import { studyParticipationAction } from "$lib/domain/study-navigation";

  let { data } = $props();
  const study = $derived(data.study);
  const relationship = $derived(
    study.isOrganizer
      ? ("organizer" as const)
      : study.isParticipant
        ? ("participant" as const)
        : study.isPending
          ? ("pending" as const)
          : ("none" as const),
  );
  const participantCount = $derived(study.participantNames.length);
  const participationAction = $derived(
    studyParticipationAction(study.status, relationship, data.canParticipate),
  );
  const sessions = $derived(
    [...data.sessions].sort((a, b) => (b.sessionNo ?? 0) - (a.sessionNo ?? 0)),
  );
  function sessionStatus(status: string) {
    return (
      (
        {
          active: "출석 접수 중",
          expired: "접수 종료",
          draft: "준비 중",
          cancelled: "취소",
        } as Record<string, string>
      )[status] ?? status
    );
  }
  function sessionDate(date: string) {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  }
  let processing = $state(false);
  let notice = $state<{ tone: "success" | "error"; message: string } | null>(
    null,
  );

  const statusLabel = $derived(STUDY_STATUS_LABELS[study.status]);
  const relationshipLabel = $derived(
    {
      organizer: "주최자",
      participant: "참여 중",
      pending: "승인 대기",
      none: "미참여",
    }[relationship],
  );

  function actionEnhancer(kind: "join" | "leave") {
    processing = true;
    notice = null;
    return async ({
      result,
      update,
    }: {
      result: import("@sveltejs/kit").ActionResult;
      update: () => Promise<void>;
    }) => {
      processing = false;
      if (result.type === "redirect") {
        await update();
        return;
      }
      if (result.type === "success") {
        await update();
        notice =
          kind === "join"
            ? {
                tone: "success",
                message: "참여 신청을 보냈습니다. 주최자 승인을 기다려 주세요.",
              }
            : { tone: "success", message: "스터디 참여 상태를 해제했습니다." };
        return;
      }
      const data =
        result.type === "failure"
          ? (result.data as { error?: string; message?: string })
          : null;
      notice = {
        tone: "error",
        message:
          data?.message ?? data?.error ?? "참여 상태를 변경하지 못했습니다.",
      };
    };
  }
</script>

<svelte:head><title>{study.title} · SNUMPS 스터디</title></svelte:head>

<article class="study-detail">
  <nav class="breadcrumbs" aria-label="현재 위치">
    <a href="/">내 활동</a><span aria-hidden="true">/</span><a href="/study"
      >스터디</a
    ><span aria-hidden="true">/</span><span>{study.title}</span>
  </nav>
  <header class="detail-heading">
    <p class="kicker">{study.semester} · {statusLabel}</p>
    <h1>{study.title}</h1>
    <p>{study.description}</p>
  </header>

  {#if notice}<div class="notice" data-tone={notice.tone} role="status">
      <p>{notice.message}</p>
      <button aria-label="알림 닫기" onclick={() => (notice = null)}>×</button>
    </div>{/if}

  <div class="content-grid">
    <section class="about-study" aria-labelledby="about-title">
      <h2 id="about-title">
        <span class="section-number" aria-hidden="true">§ 01</span>함께 공부할
        내용
      </h2>
      <dl>
        <div>
          <dt>교재·자료</dt>
          <dd>{study.textbook || "등록된 교재가 없습니다."}</dd>
        </div>
        <div>
          <dt>운영 방식</dt>
          <dd>{study.note || "운영 방식이 아직 등록되지 않았습니다."}</dd>
        </div>
        <div>
          <dt>주최자</dt>
          <dd>
            {study.organizers
              .map((member) => `${member.name} · ${member.department}`)
              .join(", ")}
          </dd>
        </div>
        <div>
          <dt>참여 인원</dt>
          <dd>{participantCount}명</dd>
        </div>
      </dl>
    </section>

    <section class="participation" aria-labelledby="participation-title">
      <p class="kicker"><span aria-hidden="true">§ 02 · </span>내 참여 상태</p>
      <h2 id="participation-title">{relationshipLabel}</h2>
      {#if participationAction === "manage"}<p>
          {isStudyClosed(study.status)
            ? "종료된 스터디의 기존 회차와 출석부를 확인할 수 있습니다. 새 회차와 참여자 변경은 잠겨 있습니다."
            : "참여자 승인과 회차·출석 관리를 할 수 있습니다."}
        </p>
        <a class="action primary" href={`/study/${study.id}/manage`}
          >주최자 작업으로 이동</a
        >
      {:else if participationAction === "closed"}<p>
          {study.status === "cancelled" ? "취소된" : "종료된"} 스터디입니다. 참여
          상태는 더 바꿀 수 없습니다.
        </p>
      {:else if participationAction === "readOnly"}<p>
          이번 학기 등록 전에는 스터디를 열람할 수 있습니다. 참여 상태 변경은
          등록 후 이용하세요.
        </p>
      {:else if participationAction === "leave"}<p>
          현재 참여자로 등록되어 있습니다. 나가면 참여자 명단에서 제외됩니다.
        </p>
        <form
          method="POST"
          action="?/leave"
          use:enhance={() => actionEnhancer("leave")}
        >
          <button
            class="action"
            disabled={processing}
            onclick={(event) => {
              if (!confirm("이 스터디에서 나가시겠습니까?"))
                event.preventDefault();
            }}>스터디 나가기</button
          >
        </form>
      {:else if participationAction === "cancel"}<p>
          신청을 보냈습니다. 주최자가 확인한 뒤 참여 여부가 결정됩니다.
        </p>
        <form
          method="POST"
          action="?/leave"
          use:enhance={() => actionEnhancer("leave")}
        >
          <button class="action" disabled={processing}>참여 신청 취소</button>
        </form>
      {:else if participationAction === "join"}<p>
          신청 후 주최자의 승인을 기다립니다. 승인 전에는 신청을 취소할 수
          있습니다.
        </p>
        <form
          method="POST"
          action="?/join"
          use:enhance={() => actionEnhancer("join")}
        >
          <button class="action primary" disabled={processing}
            >{processing ? "신청 처리 중…" : "참여 신청하기"}</button
          >
        </form>
      {:else}<p>
          현재는 새 참여 신청을 받지 않습니다. 다른 모집 중인 스터디를
          살펴보세요.
        </p>
        <a class="action" href="/study#joinable">참여 가능한 스터디 보기</a
        >{/if}
    </section>
  </div>
  <section class="session-history" aria-labelledby="session-history-title">
    <div class="history-heading">
      <h2 id="session-history-title">
        <span class="section-number" aria-hidden="true">§ 03</span>회차와 출석
      </h2>
      {#if study.isOrganizer}<a href={`/study/${study.id}/manage`}>회차 관리</a
        >{/if}
    </div>
    <p class="history-note">
      회차는 주최자가 모임마다 직접 만듭니다. 출석 링크는 주최자의 안내를 확인해
      주세요.
    </p>
    <ol>
      {#each sessions as session, index (`${session.sessionNo}-${index}`)}<li>
          <div>
            <p class="session-number">
              {session.sessionNo === null
                ? "회차 기록"
                : `${session.sessionNo}회차`}
            </p>
            <h3>{session.title}</h3>
            <p class="session-date">{sessionDate(session.date)} · KST</p>
          </div>
          <span class="session-status" data-status={session.status}
            >{sessionStatus(session.status)}</span
          >
        </li>{:else}<li class="session-empty">
          아직 생성된 회차가 없습니다. 모임을 시작하면 주최자가 회차와 출석
          링크를 안내합니다.
        </li>{/each}
    </ol>
  </section>
  <a class="back-link" href="/study">← 스터디 목록으로</a>
</article>

<style>
  .session-history {
    margin-top: 3rem;
  }
  .history-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  .history-heading a {
    color: var(--latex-accent);
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    font-size: 0.85rem;
    text-underline-offset: 0.2em;
  }
  .history-note {
    color: var(--latex-muted);
    font-size: 0.85rem;
    margin-top: 0.5rem;
    line-height: 1.6;
  }
  .session-history ol {
    list-style: none;
    padding: 0;
    margin: 1rem 0 0;
    border-top: 1px solid var(--latex-rule);
  }
  .session-history li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--latex-rule);
  }
  .session-number {
    color: var(--latex-accent);
    font-size: 0.75rem;
    font-weight: 650;
  }
  .session-history h3 {
    margin: 0.2rem 0;
    font: 600 1.1rem/1.4 var(--font-display);
  }
  .session-date,
  .session-status {
    color: var(--latex-muted);
    font-size: 0.8rem;
    line-height: 1.5;
  }
  .session-status {
    white-space: nowrap;
  }
  .session-status[data-status="active"] {
    color: var(--latex-accent);
    font-weight: 650;
  }
  .session-empty {
    color: var(--latex-muted);
    font-size: 0.88rem;
    line-height: 1.6;
  }
  .section-number {
    display: inline-block;
    margin-right: 0.65rem;
    color: var(--latex-muted);
    font: 500 0.85rem/1.4 var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .study-detail {
    max-width: 1080px;
    margin: 0 auto;
    padding: 2.2rem 1.5rem 5rem;
    color: var(--latex-text);
    font-family:
      system-ui,
      -apple-system,
      "Apple SD Gothic Neo",
      sans-serif;
  }
  .breadcrumbs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    color: var(--latex-muted);
    font-size: 0.82rem;
  }
  .breadcrumbs a {
    color: inherit;
    text-underline-offset: 0.2em;
  }
  .detail-heading {
    max-width: 45rem;
    margin: 2rem 0 2.3rem;
  }
  p,
  h1,
  h2,
  dl,
  dd {
    margin: 0;
  }
  .kicker {
    color: var(--latex-accent);
    font-size: 0.8rem;
    font-weight: 700;
  }
  h1 {
    margin: 0.35rem 0 1rem;
    font: 700 clamp(2rem, 4vw, 3rem)/1.25 var(--font-display);
    letter-spacing: -0.05em;
  }
  .detail-heading > p:last-child {
    font-size: 1rem;
    line-height: 1.7;
  }
  .content-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(17rem, 0.8fr);
    gap: 3rem;
  }
  h2 {
    font: 700 1.35rem/1.4 var(--font-display);
    letter-spacing: -0.03em;
  }
  .about-study dl {
    margin-top: 1rem;
    border-top: 1px solid var(--latex-rule);
  }
  .about-study dl > div {
    display: grid;
    grid-template-columns: 8rem 1fr;
    gap: 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--latex-rule);
  }
  dt {
    color: var(--latex-muted);
    font-size: 0.83rem;
  }
  dd {
    line-height: 1.55;
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }
  .participation {
    align-self: start;
    padding: 1.5rem;
    border: 1px solid var(--latex-rule);
    background: color-mix(in srgb, var(--latex-bg) 92%, var(--latex-text));
  }
  .participation h2 {
    margin: 0.3rem 0 0.8rem;
  }
  .participation > p:not(.kicker) {
    color: var(--latex-muted);
    font-size: 0.88rem;
    line-height: 1.65;
  }
  .participation form {
    margin: 0;
  }
  .action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 46px;
    margin-top: 1.2rem;
    padding: 0.7rem 1rem;
    border: 1px solid var(--latex-text);
    color: var(--latex-text);
    background: transparent;
    font:
      700 0.9rem/1.3 system-ui,
      sans-serif;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }
  .action.primary {
    color: var(--latex-bg);
    background: var(--latex-text);
  }
  .action:disabled {
    opacity: 0.55;
    cursor: wait;
  }
  .back-link {
    display: inline-block;
    margin-top: 2.5rem;
    color: var(--latex-text);
    font-size: 0.85rem;
    text-underline-offset: 0.2em;
  }
  .notice {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding: 1rem;
    border-left: 4px solid var(--latex-text);
    background: color-mix(in srgb, var(--latex-bg) 90%, var(--latex-text));
  }
  .notice[data-tone="error"] {
    border-color: var(--latex-accent);
  }
  .notice button {
    border: 0;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }
  :global(.study-detail a:focus-visible),
  :global(.study-detail button:focus-visible) {
    outline: 3px solid var(--latex-accent);
    outline-offset: 3px;
  }
  @media (max-width: 760px) {
    .study-detail {
      padding: 1.3rem 1rem 4rem;
    }
    .content-grid {
      grid-template-columns: 1fr;
      gap: 2rem;
    }
    .participation {
      grid-row: 1;
    }
    .about-study dl > div {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }
  }
</style>
