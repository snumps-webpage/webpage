<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";

  let { data } = $props();
  let query = $state("");

  const filteredMembers = $derived.by(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return data.members;
    return data.members.filter((member) =>
      [
        member.name,
        member.department,
        member.joinedAt ?? "",
        ...member.roles.flatMap((role) => [role.term, role.title]),
      ].some((value) => value.toLocaleLowerCase("ko-KR").includes(normalized)),
    );
  });

  function joinedLabel(value: string | null) {
    return value ? new Date(`${value}T00:00:00`).toLocaleDateString("ko-KR") : "기록 없음";
  }
</script>

<svelte:head>
  <title>회원 명단 · 서울대학교 수학문제연구회</title>
  <meta
    name="description"
    content="서울대학교 수학문제연구회 회원의 이름, 학과, 가입일 및 임원 이력입니다."
  />
</svelte:head>

<article class="paper-document public-member-paper">
  <ManuscriptHeader
    title="회원 명단"
    subtitle="Public Member Register"
    figure={MANUSCRIPT.FIGURES.PUBLIC_MEMBERS}
  />

  <div class="intro-row">
    <p>이름·학과·가입일·학기별 직책만 공개합니다. 연락처와 회원 지위, 관리자 권한은 포함하지 않습니다.</p>
    <a class="paper-btn" href="/about/executives">역대 회장단</a>
  </div>

  {#if data.dataAvailable}
    <section class="search-panel">
      <label class="paper-label" for="public-member-search">명단 검색</label>
      <input
        id="public-member-search"
        type="search"
        bind:value={query}
        placeholder="이름, 학과, 가입일, 학기 또는 직책"
      />
      <span>{filteredMembers.length} / {data.members.length}</span>
    </section>

    <div class="member-table-wrap desktop-register">
      <table>
        <thead>
          <tr>
            <th scope="col">No.</th>
            <th scope="col">이름</th>
            <th scope="col">학과</th>
            <th scope="col">가입일</th>
            <th scope="col">임원 이력</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredMembers as member, index (`${member.name}-${member.department}-${index}`)}
            <tr>
              <td>{String(index + 1).padStart(3, "0")}</td>
              <th scope="row">{member.name}</th>
              <td>{member.department}</td>
              <td>{joinedLabel(member.joinedAt)}</td>
              <td>
                {#each member.roles as role (`${role.term}-${role.title}`)}
                  <span class="role-chip">{role.term} {role.title}</span>
                {:else}
                  <span class="muted">—</span>
                {/each}
              </td>
            </tr>
          {:else}
            <tr><td colspan="5" class="empty-state">검색 결과가 없습니다.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <section class="mobile-register" aria-label="회원 명단">
      {#each filteredMembers as member, index (`${member.name}-${member.department}-${index}`)}
        <article class="member-card">
          <header>
            <span>{String(index + 1).padStart(3, "0")}</span>
            <div><h2>{member.name}</h2><p>{member.department}</p></div>
            <time datetime={member.joinedAt ?? undefined}>{joinedLabel(member.joinedAt)}</time>
          </header>
          <div class="mobile-roles">
            {#each member.roles as role (`${role.term}-${role.title}`)}
              <span>{role.term} · {role.title}</span>
            {:else}
              <span class="muted">직책 이력 없음</span>
            {/each}
          </div>
        </article>
      {:else}
        <p class="empty-state">검색 결과가 없습니다.</p>
      {/each}
    </section>

    <p class="freshness">조회 기준 {new Date(data.generatedAt).toLocaleString("ko-KR")}</p>
  {:else}
    <p class="unavailable">새 AWS 공개 회원 API 연결 후 명단이 표시됩니다.</p>
  {/if}
</article>

<style>
  .public-member-paper { width: min(100%, 1120px); }
  .intro-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
  .intro-row p { max-width: 48rem; margin: 0; color: var(--latex-muted); font-size: 0.82rem; line-height: 1.65; }
  .search-panel { position: relative; margin-bottom: 0.9rem; padding: 0.85rem; border: 1px solid var(--latex-rule); }
  .search-panel input { width: 100%; padding-right: 5rem; }
  .search-panel > span { position: absolute; right: 1.5rem; bottom: 1.55rem; color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.62rem; font-weight: 700; }
  .member-table-wrap { overflow-x: auto; border: 1px solid var(--latex-rule); }
  table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  th, td { padding: 0.62rem 0.65rem; border-right: 1px solid var(--latex-rule); border-bottom: 1px solid var(--latex-rule); text-align: left; vertical-align: top; }
  tr:last-child th, tr:last-child td { border-bottom: 0; }
  th:last-child, td:last-child { border-right: 0; }
  thead th, tbody td:first-child { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.6rem; letter-spacing: 0.06em; text-transform: uppercase; }
  tbody th { font-size: 0.88rem; font-weight: 570; }
  .role-chip { display: inline-flex; margin: 0 0.3rem 0.3rem 0; padding: 0.18rem 0.3rem; background: color-mix(in srgb, var(--latex-rule) 12%, transparent); font-size: 0.65rem; white-space: nowrap; }
  .muted { color: var(--latex-muted); }
  .mobile-register { display: none; }
  .empty-state, .unavailable { margin: 0; padding: 1.5rem; color: var(--latex-muted); text-align: center; }
  .unavailable { border: 1px dashed var(--latex-rule); }
  .freshness { margin: 0.8rem 0 0; color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.56rem; text-align: right; text-transform: uppercase; }
  @media (max-width: 720px) {
    .intro-row { align-items: stretch; flex-direction: column; }
    .intro-row a { width: 100%; }
    .desktop-register { display: none; }
    .mobile-register { display: grid; gap: 0.55rem; }
    .member-card { border: 1px solid var(--latex-rule); }
    .member-card header { display: grid; grid-template-columns: auto 1fr auto; gap: 0.65rem; align-items: start; padding: 0.7rem; }
    .member-card header > span, .member-card time { color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.56rem; }
    .member-card h2, .member-card p { margin: 0; }
    .member-card h2 { font-size: 0.98rem; font-weight: 570; }
    .member-card p { margin-top: 0.12rem; color: var(--latex-muted); font-size: 0.7rem; }
    .mobile-roles { display: flex; flex-wrap: wrap; gap: 0.3rem; padding: 0.6rem 0.7rem; border-top: 1px solid var(--latex-rule); }
    .mobile-roles span { font-size: 0.66rem; }
  }
  @media (max-width: 440px) {
    .member-card header { grid-template-columns: auto 1fr; }
    .member-card time { grid-column: 2; }
  }
</style>
