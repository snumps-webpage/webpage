<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  let { data, form } = $props();
  let query = $state("");
  const visible = $derived(
    data.series.filter((s) =>
      `${s.title} ${s.description}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    ),
  );
</script>

<svelte:head><title>세미나 회차 관리 · SNUMPS 관리자</title></svelte:head>
<article class="paper-document">
  <ManuscriptHeader
    title="세미나 회차 관리"
    subtitle="Series · Sessions · Attendance"
    figure={MANUSCRIPT.FIGURES.ADMIN_SEMINARS}
  />
  <AdminSectionNav />
  <p><a href="/admin/seminars">신청 심사·일정·공개 관리</a></p>
  {#if form?.error}<p class="notice" role="alert">
      저장하지 못했습니다. {form.error} 다시 확인해 주세요.
    </p>{/if}
  {#if form?.operation === "created"}<p class="notice" role="status">
      세미나를 만들었습니다. <a href={`/admin/seminar-series/${form.seriesId}`}
        >회차 추가하기</a
      >
    </p>{/if}
  <details class="create">
    <summary>새 세미나 묶음 만들기</summary>
    <form method="POST" action="?/create">
      <label>공통 제목 <input name="title" required maxlength="300" /></label>
      <label
        >소개 <textarea name="description" rows="3" maxlength="20000"
        ></textarea></label
      >
      <p class="help">
        일정·발표자·자료·출석은 회차별로 관리합니다. 묶음 생성만으로 활동 실적이
        생기지 않습니다.
      </p>
      <button class="paper-btn" type="submit">세미나 만들기</button>
    </form>
  </details>
  <label class="search"
    >세미나 검색 <input
      type="search"
      bind:value={query}
      placeholder="제목·소개"
    /></label
  >
  <div class="series-list">
    {#each visible as parent (parent.id)}
      <section>
        <div>
          <h2>
            <a href={`/admin/seminar-series/${parent.id}`}>{parent.title}</a>
          </h2>
          <p>
            {parent.sessions.length}회차 · 공개 {parent.sessions.filter(
              (s) => s.publicationStatus === "published",
            ).length}개
          </p>
        </div>
        <a
          class="paper-btn secondary"
          href={`/admin/seminar-series/${parent.id}`}>회차·출석 관리</a
        >
      </section>
    {:else}<p class="empty">표시할 세미나가 없습니다.</p>{/each}
  </div>
</article>

<style>
  .create,
  .search,
  .series-list {
    margin-top: 1.25rem;
  }
  .create {
    border: 1px solid var(--latex-rule);
    padding: 1rem;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
  form {
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
  }
  label {
    display: grid;
    gap: 0.4rem;
  }
  input,
  textarea {
    width: 100%;
    padding: 0.6rem;
    border: 1px solid var(--latex-rule);
    background: var(--latex-bg);
    color: var(--latex-text);
    font: inherit;
    box-sizing: border-box;
  }
  .help,
  .series-list p {
    color: var(--latex-muted);
    font-size: 0.85rem;
  }
  .notice {
    padding: 1rem;
    border: 1px solid var(--latex-rule);
  }
  .series-list section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--latex-rule);
  }
  h2 {
    font-size: 1.1rem;
    margin: 0;
  }
  .series-list p {
    margin: 0.35rem 0 0;
  }
  .empty {
    padding: 2rem 0;
  }
  form button {
    justify-self: start;
  }
  @media (max-width: 600px) {
    .series-list section {
      align-items: start;
      flex-direction: column;
    }
  }
</style>
