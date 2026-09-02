<script lang="ts">
  import type { AdminSeminarRequestItem } from "$lib/domain/admin-seminars";
  import type { AdminStudyRequestItem } from "$lib/domain/studies";
  import type { AdminWithdrawalQueueItem } from "$lib/domain/admin-dashboard";

  interface Props {
    seminarRequests: AdminSeminarRequestItem[];
    studyRequests: AdminStudyRequestItem[];
    withdrawals: AdminWithdrawalQueueItem[];
  }

  let { seminarRequests, studyRequests, withdrawals }: Props = $props();

  function seminarKind(kind: AdminSeminarRequestItem["kind"]) {
    return kind === "regular" ? "정기 편성" : "비정기";
  }
</script>

<section class="review-inbox" aria-labelledby="review-inbox-heading">
  <header class="section-heading">
    <div>
      <p>Queues B–D</p>
      <h2 id="review-inbox-heading">개설 심사 인박스</h2>
    </div>
    <span>{seminarRequests.length + studyRequests.length + withdrawals.length}건</span>
  </header>

  <div class="queue-grid">
    <section class="queue-panel" aria-labelledby="seminar-queue-heading">
      <header>
        <div>
          <p>Seminar</p>
          <h3 id="seminar-queue-heading">세미나 신청</h3>
        </div>
        <strong>{seminarRequests.length}</strong>
      </header>
      <div class="queue-items">
        {#each seminarRequests as request (request.id)}
          <article>
            <div>
              <span>{seminarKind(request.kind)} · {request.requester.name}</span>
              <h4>{request.title}</h4>
            </div>
            <time datetime={request.createdAt}>{new Date(request.createdAt).toLocaleDateString("ko-KR")}</time>
          </article>
        {:else}
          <p class="empty-state">심사할 세미나 신청이 없습니다.</p>
        {/each}
      </div>
      <a class="queue-link" href="/admin/seminars">세미나 심사·일정 작업함 열기 <span aria-hidden="true">→</span></a>
    </section>

    <section class="queue-panel" aria-labelledby="study-queue-heading">
      <header>
        <div>
          <p>Study</p>
          <h3 id="study-queue-heading">스터디 신청</h3>
        </div>
        <strong>{studyRequests.length}</strong>
      </header>
      <div class="queue-items">
        {#each studyRequests as request (request.id)}
          <article>
            <div>
              <span>{request.semester} · {request.requester.name}</span>
              <h4>{request.title}</h4>
            </div>
            <time datetime={request.createdAt}>{new Date(request.createdAt).toLocaleDateString("ko-KR")}</time>
          </article>
        {:else}
          <p class="empty-state">심사할 스터디 신청이 없습니다.</p>
        {/each}
      </div>
      <a class="queue-link" href="/admin/studies">스터디 심사 작업함 열기 <span aria-hidden="true">→</span></a>
    </section>

    <section class="queue-panel" aria-labelledby="withdrawal-queue-heading">
      <header>
        <div>
          <p>Withdrawal</p>
          <h3 id="withdrawal-queue-heading">탈퇴 유예</h3>
        </div>
        <strong>{withdrawals.length}</strong>
      </header>
      <div class="queue-items">
        {#each withdrawals as withdrawal (withdrawal.memberId)}
          <article>
            <div>
              <span>{withdrawal.holdBy ? "보존 필요 표시" : "유예 진행 중"}</span>
              <h4>{withdrawal.name}</h4>
            </div>
            <time datetime={withdrawal.graceEndsAt}>{new Date(withdrawal.graceEndsAt).toLocaleDateString("ko-KR")}</time>
          </article>
        {:else}
          <p class="empty-state">탈퇴 유예 중인 회원이 없습니다.</p>
        {/each}
      </div>
      <a class="queue-link" href="/admin/members">회원 권한 기록 열기 <span aria-hidden="true">→</span></a>
    </section>
  </div>
</section>

<style>
  .review-inbox { display: grid; gap: 0.8rem; }
  .section-heading, .queue-panel > header, article, .queue-link { display: flex; align-items: start; justify-content: space-between; gap: 0.8rem; }
  .section-heading { padding-bottom: 0.55rem; border-bottom: 1px solid var(--latex-rule); }
  .section-heading p, .section-heading h2, .queue-panel header p, .queue-panel h3, article h4 { margin: 0; }
  .section-heading p, .section-heading > span, .queue-panel header p, article span, time { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.56rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .section-heading h2 { margin-top: 0.12rem; font-size: 1.2rem; font-weight: 570; }
  .queue-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
  .queue-panel { display: grid; align-content: start; border: 1px solid var(--latex-rule); border-top-width: 2px; }
  .queue-panel > header { align-items: center; padding: 0.75rem; border-bottom: 1px solid var(--latex-rule); }
  .queue-panel h3 { margin-top: 0.12rem; font-size: 1rem; }
  .queue-panel header strong { font-family: var(--font-math); font-size: 1.55rem; font-weight: 500; }
  .queue-items { display: grid; }
  article { align-items: center; padding: 0.68rem 0.75rem; border-bottom: 1px solid color-mix(in srgb, var(--latex-rule) 58%, transparent); }
  article > div { min-width: 0; }
  article h4 { margin-top: 0.16rem; overflow-wrap: anywhere; font-size: 0.82rem; font-weight: 600; }
  time { flex: 0 0 auto; white-space: nowrap; }
  .queue-link { align-items: center; margin-top: auto; padding: 0.7rem 0.75rem; color: var(--latex-text); font-family: var(--font-mono); font-size: 0.6rem; font-weight: 700; text-decoration: none; text-transform: uppercase; }
  .queue-link:hover, .queue-link:focus-visible { background: var(--latex-text); color: var(--latex-bg); }
  .empty-state { margin: 0; padding: 1rem 0.75rem; border-bottom: 1px solid var(--latex-rule); color: var(--latex-muted); font-size: 0.72rem; text-align: center; }
  @media (max-width: 760px) { .queue-grid { grid-template-columns: 1fr; } }
</style>
