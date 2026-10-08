<script lang="ts">
  import {
    SEMINAR_PROGRESS_STEPS,
    seminarRequestProgress,
    seminarScheduleLabel,
    type OwnSeminarRequestItem,
  } from "$lib/domain/seminar-progress";

  let {
    requests,
    canParticipate,
  }: {
    requests: OwnSeminarRequestItem[];
    canParticipate: boolean;
  } = $props();
</script>

<section class="seminar-progress" aria-labelledby="my-seminars-heading">
  <header class="section-heading">
    <div>
      <p>§ 01 · 내 제안과 발표</p>
      <h2 id="my-seminars-heading">세미나 진행 상황</h2>
    </div>
    {#if canParticipate}<a
        class="paper-btn secondary small"
        href="/seminar/apply">세미나 제안하기</a
      >{/if}
  </header>
  <p class="section-intro">
    신청 심사와 일정 공개는 별도 단계입니다. 신청자 또는 발표자로 참여한 내역만
    표시합니다.
  </p>
  <div class="proposal-list">
    {#each requests as request (request.id)}
      {@const progress = seminarRequestProgress(request)}
      <article
        class="proposal-row"
        data-request-status={request.status}
        data-publication-status={request.publicationStatus}
      >
        <div class="proposal-heading">
          <h3>{request.title}</h3>
          <span class="state-label">{progress.label}</span>
        </div>
        {#if progress.step !== null}
          <ol class="progress-steps" aria-label={`${request.title} 진행 단계`}>
            {#each SEMINAR_PROGRESS_STEPS as step, index (step)}
              <li
                data-state={index < progress.step
                  ? "done"
                  : index === progress.step
                    ? "current"
                    : "upcoming"}
                aria-current={index === progress.step ? "step" : undefined}
              >
                <span class="step-number">{index + 1}</span><span>{step}</span>
              </li>
            {/each}
          </ol>
        {/if}
        <p class="next-action">{progress.next}</p>
        {#if request.schedule}
          <dl class="proposal-schedule">
            <div>
              <dt>일시 · KST</dt>
              <dd>
                {seminarScheduleLabel(
                  request.schedule,
                )}{#if request.schedule.startTime === null}<span
                    >시각 기록 없음</span
                  >{/if}
              </dd>
            </div>
            <div>
              <dt>장소</dt>
              <dd>{request.schedule.location}</dd>
            </div>
          </dl>
        {/if}
        <footer>
          <span
            >신청일 {new Intl.DateTimeFormat("ko-KR", {
              timeZone: "Asia/Seoul",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(request.submittedAt))}</span
          >
          {#if request.editPath}<a href={request.editPath}>신청 수정·철회</a
            >{/if}
          {#if request.publicPath}<a href={request.publicPath}
              >공개 세미나 보기 →</a
            >{/if}
        </footer>
      </article>
    {:else}
      <p class="empty">신청하거나 발표자로 참여한 세미나가 없습니다.</p>
    {/each}
  </div>
</section>

<style>
  .seminar-progress {
    margin-bottom: 1.7rem;
    font-family: var(--font-ui);
  }
  .section-heading {
    display: flex;
    gap: 1rem;
    align-items: end;
    justify-content: space-between;
    padding-bottom: 0.75rem;
    border-bottom: 2px solid var(--latex-rule);
  }
  .section-heading p {
    margin: 0 0 0.3rem;
    color: var(--latex-muted);
    font: 600 0.7rem/1.5 var(--font-ui);
    letter-spacing: 0.04em;
  }
  h2 {
    margin: 0;
    font: 550 1.45rem/1.4 var(--font-display);
  }
  .section-intro {
    margin: 0.65rem 0 1rem;
    color: var(--latex-muted);
    font-size: 0.83rem;
    line-height: 1.7;
  }
  .proposal-row {
    padding: 1.15rem 0;
    border-bottom: 1px solid var(--latex-rule);
  }
  .proposal-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.8rem;
  }
  h3 {
    margin: 0;
    font: 550 1.15rem/1.5 var(--font-display);
    overflow-wrap: anywhere;
  }
  .state-label {
    flex-shrink: 0;
    color: var(--latex-accent);
    font-size: 0.76rem;
    font-weight: 650;
  }
  .progress-steps {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4rem;
    list-style: none;
    padding: 0;
    margin: 0.85rem 0;
  }
  .progress-steps li {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0;
    color: var(--latex-muted);
    border-top: 1px solid var(--latex-rule);
    font-size: 0.75rem;
  }
  .step-number {
    font-family: var(--font-math);
  }
  .progress-steps li[data-state="current"] {
    border-top: 2px solid var(--latex-accent);
    color: var(--latex-accent);
    font-weight: 700;
  }
  .progress-steps li[data-state="done"] {
    color: var(--latex-text);
  }
  .next-action {
    margin: 0.65rem 0;
    font-size: 0.85rem;
    line-height: 1.75;
  }
  .proposal-schedule {
    display: grid;
    gap: 0.5rem;
    margin: 0.8rem 0;
    padding: 0.75rem 0.9rem;
    background: var(--latex-surface);
    border-left: 2px solid var(--latex-rule);
  }
  .proposal-schedule div {
    display: grid;
    grid-template-columns: 6rem minmax(0, 1fr);
    gap: 0.6rem;
  }
  dt {
    color: var(--latex-muted);
    font-size: 0.73rem;
  }
  dd {
    margin: 0;
    font-size: 0.86rem;
    overflow-wrap: anywhere;
  }
  dd span {
    display: block;
    margin-top: 0.2rem;
    color: var(--latex-muted);
    font-size: 0.73rem;
  }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 0.8rem;
    font-size: 0.75rem;
  }
  footer > span {
    color: var(--latex-muted);
  }
  footer a {
    color: var(--latex-text);
    font-weight: 650;
    text-underline-offset: 0.2em;
    padding: 0.4rem 0;
    min-height: 2.75rem;
    display: inline-flex;
    align-items: center;
  }
  .empty {
    color: var(--latex-muted);
    font-size: 0.85rem;
    padding: 1rem 0;
  }
  @media (max-width: 640px) {
    .section-heading {
      align-items: start;
      flex-direction: column;
    }
    .proposal-heading {
      align-items: start;
      flex-direction: column;
      gap: 0.3rem;
    }
    .progress-steps li {
      font-size: 0.68rem;
      gap: 0.3rem;
    }
    .proposal-schedule div {
      grid-template-columns: 1fr;
      gap: 0.2rem;
    }
  }
</style>
