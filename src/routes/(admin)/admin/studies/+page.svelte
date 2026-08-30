<script lang="ts">
  import { enhance } from "$app/forms";
  import { onMount } from "svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import AdminStudyRecordEditor, {
    type StudyRecordFormState,
  } from "$lib/components/admin/AdminStudyRecordEditor.svelte";
  import type { AdminStudyRequestItem } from "$lib/domain/studies";
  import { MANUSCRIPT } from "$lib/constants";
  import { fetchAdminQueue } from "$lib/client/api";
  import { createAdminQueuePoller } from "$lib/client/admin-queue-poller";

  let { data, form } = $props();
  // Load data is the record authority; successful actions re-run it and this
  // writable derived resyncs (the poller may overwrite it in between).
  let requests: AdminStudyRequestItem[] = $derived([...data.requests]);
  const records = $derived(data.records);
  let processingId = $state<string | null>(null);
  let notice = $state<{ tone: "success" | "error"; message: string } | null>(
    null,
  );
  let pollingError = $state<string | null>(null);

  async function refreshRequests() {
    try {
      const response = await fetchAdminQueue<AdminStudyRequestItem>(
        "/api/admin/study-requests",
      );
      requests = response.items;
      pollingError = null;
    } catch {
      pollingError =
        "스터디 신청 큐를 새로고침하지 못했습니다. 직전 목록을 표시합니다.";
    }
  }

  onMount(() => {
    const poller = createAdminQueuePoller(refreshRequests);
    poller.start();
    return () => poller.stop();
  });

  function requestEnhancer(request: AdminStudyRequestItem, approved: boolean) {
    processingId = request.id;
    notice = null;
    return async ({
      result,
      update,
    }: {
      result: import("@sveltejs/kit").ActionResult;
      update: (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;
    }) => {
      processingId = null;
      if (result.type === "success") {
        requests = requests.filter((item) => item.id !== request.id);
        notice = approved
          ? {
              tone: "success",
              message: `‘${request.title}’을 모집 중 상태로 개설하고 신청자에게 승인 메일을 보냈습니다.`,
            }
          : {
              tone: "success",
              message: "스터디 신청을 반려하고 신청자에게 결과 메일을 보냈습니다.",
            };
        // The approval creates the study on /admin — reload this page's records.
        await update({ reset: false });
        void refreshRequests();
        return;
      }
      const failure =
        result.type === "failure"
          ? (result.data as { error?: string; message?: string })
          : null;
      notice = {
        tone: "error",
        message: failure?.message ?? failure?.error ?? "스터디 신청을 처리하지 못했습니다.",
      };
    };
  }
</script>

<svelte:head><title>스터디 승인 · SNUMPS 관리자</title></svelte:head>

<article class="paper-document admin-study-paper">
  <ManuscriptHeader
    title="스터디 승인"
    subtitle="Study Proposal Review Queue"
    figure={MANUSCRIPT.FIGURES.ADMIN_STUDIES}
  />
  <AdminSectionNav />

  <div class="page-toolbar">
    <p>
      개설 취지와 자료를 검토합니다. 승인하면 신청자를 주최자로 지정해 모집 중
      스터디를 만듭니다.
    </p>
    <a href="/admin" class="paper-btn">전체 관리자 화면</a>
  </div>

  {#if notice}
    <div class="notice" data-tone={notice.tone} role="status">
      <p>{notice.message}</p>
      <button aria-label="알림 닫기" onclick={() => (notice = null)}>×</button>
    </div>
  {/if}

  <section class="review-index">
    <div><span>Pending</span><strong>{requests.length}</strong></div>
    <p>승인·반려 결과는 신청자에게 1회 안내됩니다.</p>
  </section>

  <section class="request-grid" aria-label="스터디 개설 신청">
    {#each requests as request (request.id)}
      <article class="request-card">
        <header>
          <div>
            <p>{request.semester} · {request.requester.name}</p>
            <h2>{request.title}</h2>
          </div>
          <span>{new Date(request.createdAt).toLocaleDateString("ko-KR")}</span>
        </header>
        <p class="description">{request.description}</p>
        <dl>
          <div>
            <dt>교재·자료</dt>
            <dd>{request.textbook}</dd>
          </div>
          <div>
            <dt>신청자</dt>
            <dd>{request.requester.name} · {request.requester.department}</dd>
          </div>
        </dl>
        <footer>
          <form
            method="POST"
            action="/admin?/rejectStudy"
            use:enhance={() => requestEnhancer(request, false)}
          >
            <input type="hidden" name="id" value={request.id} />
            <button
              class="paper-btn danger"
              disabled={processingId === request.id}
              onclick={(event) => {
                if (!confirm("이 스터디 개설 신청을 반려하시겠습니까?"))
                  event.preventDefault();
              }}>반려</button
            >
          </form>
          <form
            method="POST"
            action="/admin?/approveStudy"
            use:enhance={() => requestEnhancer(request, true)}
          >
            <input type="hidden" name="id" value={request.id} />
            <button
              class="paper-btn primary"
              disabled={processingId === request.id}>승인 및 개설</button
            >
          </form>
        </footer>
      </article>
    {:else}
      <p class="empty-state">심사할 스터디 신청이 없습니다.</p>
    {/each}
  </section>

  <AdminStudyRecordEditor
    {records}
    members={data.members}
    currentTerm={data.currentTerm}
    form={form as StudyRecordFormState | null}
  />

  {#if pollingError}
    <p class="polling-error" role="status">{pollingError}</p>
  {/if}

  <p class="freshness">
    프리뷰 데이터 기준 {new Date(data.generatedAt).toLocaleString("ko-KR")}
  </p>
</article>

<style>
  .admin-study-paper {
    width: min(100%, 1100px);
  }
  .page-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    padding-bottom: 0.8rem;
    border-bottom: 1px solid var(--latex-rule);
  }
  .page-toolbar p {
    max-width: 48rem;
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.84rem;
    line-height: 1.6;
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
  }
  .review-index {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.8rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--latex-rule);
  }
  .review-index div {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
  }
  .review-index span,
  .request-card header > span,
  .request-card header p,
  dt,
  .freshness {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .review-index strong {
    font-family: var(--font-math);
    font-size: 1.3rem;
    font-weight: 550;
  }
  .review-index p {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.74rem;
  }
  .request-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
  }
  .request-card {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
    border: 1px solid var(--latex-rule);
    border-top: 3px solid var(--latex-accent);
  }
  .request-card header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .request-card header p,
  .request-card h2,
  .description,
  dl,
  dd {
    margin: 0;
  }
  .request-card header p {
    color: var(--latex-accent);
  }
  .request-card h2 {
    margin-top: 0.2rem;
    font-size: 1.1rem;
    font-weight: 570;
  }
  .description {
    color: var(--latex-muted);
    font-size: 0.82rem;
    line-height: 1.65;
  }
  dl {
    display: grid;
    gap: 0.4rem;
    padding-top: 0.7rem;
    border-top: 1px solid var(--latex-rule);
  }
  dl div {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr);
    gap: 0.6rem;
  }
  dd {
    font-size: 0.76rem;
  }
  .request-card footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
  }
  .request-card footer form {
    margin: 0;
  }
  :global(.paper-btn.danger) {
    border-color: var(--latex-accent);
    color: var(--latex-accent);
  }
  .empty-state {
    grid-column: 1 / -1;
    margin: 0;
    padding: 1.5rem;
    border: 1px dashed var(--latex-rule);
    color: var(--latex-muted);
    text-align: center;
  }
  .freshness {
    margin: 1rem 0 0;
    text-align: right;
  }
  .polling-error {
    margin: 1rem 0 0;
    color: var(--color-danger-text);
    font-size: 0.72rem;
  }
  @media (max-width: 760px) {
    .page-toolbar,
    .review-index {
      align-items: stretch;
      flex-direction: column;
    }
    .page-toolbar a {
      width: 100%;
    }
    .request-grid {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 460px) {
    .request-card footer {
      flex-direction: column-reverse;
    }
    .request-card footer button {
      width: 100%;
    }
  }
</style>
