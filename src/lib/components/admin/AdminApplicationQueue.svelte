<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { AdminMembershipApplicationItem } from "$lib/domain/admin-dashboard";

  interface Props {
    applications: AdminMembershipApplicationItem[];
    onResolved: (applicationId: string, approved: boolean) => void;
    onError: (message: string) => void;
  }

  let { applications, onResolved, onError }: Props = $props();
  let processingId = $state<string | null>(null);

  function submit(applicationId: string, approved: boolean): SubmitFunction {
    return () => {
      processingId = applicationId;
      return async ({ result }) => {
        processingId = null;
        if (result.type === "success") onResolved(applicationId, approved);
        else onError("가입 신청을 처리하지 못했습니다.");
      };
    };
  }
</script>

<section class="admin-section" aria-labelledby="applications-heading">
  <header class="section-heading">
    <div>
      <p>Queue A</p>
      <h2 id="applications-heading">가입 신청</h2>
    </div>
    <span>{applications.length}건</span>
  </header>

  <div class="application-grid">
    {#each applications as application (application.id)}
      <article class="application-card">
        <header>
          <div>
            <p>{application.department}</p>
            <h3>{application.name}</h3>
          </div>
          <time datetime={application.submittedAt}>{new Date(application.submittedAt).toLocaleDateString("ko-KR")}</time>
        </header>
        <dl>
          <div><dt>이메일</dt><dd>{application.email}</dd></div>
          {#if application.studentId}
            <div><dt>학번</dt><dd>{application.studentId}</dd></div>
          {/if}
          <div><dt>전화번호</dt><dd>{application.phone}</dd></div>
        </dl>
        <details>
          <summary>지원 배경 읽기</summary>
          <p>{application.background}</p>
        </details>
        <div class="card-actions">
          <form method="POST" action="?/approve" use:enhance={submit(application.id, true)}>
            <input type="hidden" name="id" value={application.id} />
            <button class="paper-btn primary" disabled={processingId !== null}>승인</button>
          </form>
          <form method="POST" action="?/reject" use:enhance={submit(application.id, false)}>
            <input type="hidden" name="id" value={application.id} />
            <button class="paper-btn danger" disabled={processingId !== null}>반려</button>
          </form>
        </div>
      </article>
    {:else}
      <p class="empty-state">처리할 가입 신청이 없습니다.</p>
    {/each}
  </div>
</section>

<style>
  .admin-section { display: grid; gap: 0.8rem; }
  .section-heading, .application-card > header, .card-actions { display: flex; align-items: start; justify-content: space-between; gap: 0.8rem; }
  .section-heading { padding-bottom: 0.55rem; border-bottom: 1px solid var(--latex-rule); }
  .section-heading p, .section-heading h2, .application-card header p, .application-card h3 { margin: 0; }
  .section-heading p, .section-heading > span, .application-card header p, time, dt { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.58rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; }
  .section-heading h2 { margin-top: 0.12rem; font-size: 1.2rem; font-weight: 570; }
  .application-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; }
  .application-card { display: grid; gap: 0.75rem; padding: 0.85rem; border: 1px solid var(--latex-rule); border-top-width: 2px; }
  .application-card h3 { margin-top: 0.15rem; font-size: 1.02rem; }
  dl { display: grid; gap: 0.35rem; margin: 0; }
  dl div { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); gap: 0.45rem; }
  dd { min-width: 0; margin: 0; overflow-wrap: anywhere; font-size: 0.76rem; }
  details { padding: 0.55rem 0; border-block: 1px solid var(--latex-rule); }
  summary { cursor: pointer; color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.62rem; font-weight: 700; }
  details p { margin: 0.55rem 0 0; font-size: 0.8rem; line-height: 1.65; }
  .card-actions { justify-content: flex-end; }
  .card-actions form { flex: 1; }
  .card-actions button { width: 100%; }
  .empty-state { grid-column: 1 / -1; margin: 0; padding: 1.25rem; border: 1px dashed var(--latex-rule); color: var(--latex-muted); text-align: center; }
  @media (max-width: 700px) { .application-grid { grid-template-columns: 1fr; } }
</style>
