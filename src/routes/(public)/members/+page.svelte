<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import {
    MEMBER_STANDING_LABELS,
    MEMBER_VIEWS,
    MEMBER_VIEW_LABELS,
    REGULAR_RECORD_THRESHOLD,
    inMemberView,
    type MemberView,
  } from "$lib/domain/member-activity";

  let { data } = $props();
  let query = $state("");
  // 기본은 현재 회원(정회원+준회원) 보기 (snumps-webpage/D-000077)
  let view = $state<MemberView>("current");

  const viewMembers = $derived(
    data.members.filter((member) => inMemberView(member.standing, view)),
  );

  const filteredMembers = $derived.by(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return viewMembers;
    return viewMembers.filter((member) =>
      [
        member.name,
        member.department,
        member.joinedAt ?? "",
        MEMBER_STANDING_LABELS[member.standing],
        ...member.roles.flatMap((role) => [role.term, role.title]),
      ].some((value) => value.toLocaleLowerCase("ko-KR").includes(normalized)),
    );
  });

  /** 0은 '—' (D-000068) */
  function countLabel(count: number) {
    return count ? String(count) : "—";
  }

  function joinedLabel(value: string | null) {
    return value
      ? new Date(`${value}T00:00:00`).toLocaleDateString("ko-KR")
      : "기록 없음";
  }
</script>

<svelte:head>
  <title>회원 명단 · 서울대학교 수학문제연구회</title>
  <meta
    name="description"
    content="서울대학교 수학문제연구회 회원의 이름, 학과, 가입일, 임원 이력, 회칙 기준 회원 지위와 세미나·스터디 주최 기록입니다."
  />
</svelte:head>

<article class="paper-document public-member-paper">
  <ManuscriptHeader
    title="회원 명단"
    subtitle="Public Member Register"
    figure={MANUSCRIPT.FIGURES.PUBLIC_MEMBERS}
  />

  <div class="intro-row">
    <p>
      이름·학과·가입일·학기별 직책, 회원 지위와 세미나·스터디 주최, 활동 참석
      기록을 공개합니다. 연락처와 관리자 권한은 포함하지 않습니다. 회원 지위는
      <a href="/about/charter#제4조">회칙</a>을 따릅니다 — 이번 학기에 등록한
      회원은 활동 기록이 {REGULAR_RECORD_THRESHOLD}회 이상이면 정회원, 아니면
      준회원이고, 등록하지 않은 회원은 정회원이었던 적이 있으면 동문, 아니면
      이전 회원입니다. 활동 기록은 세미나 진행·참석, 4회 이상 진행된 스터디의
      과반 참석, 회식·회의 등 동아리 활동 참석을 셉니다.
    </p>
    <a class="paper-btn" href="/about/executives">역대 회장단</a>
  </div>

  {#if data.dataAvailable}
    <div class="view-toggle" role="group" aria-label="명단 보기">
      {#each MEMBER_VIEWS as option (option)}
        <button
          type="button"
          class="paper-btn small"
          class:primary={view === option}
          aria-pressed={view === option}
          onclick={() => (view = option)}>{MEMBER_VIEW_LABELS[option]}</button
        >
      {/each}
    </div>

    <section class="search-panel">
      <label class="paper-label" for="public-member-search">명단 검색</label>
      <input
        id="public-member-search"
        type="search"
        bind:value={query}
        placeholder="이름, 학과, 가입일, 지위, 학기 또는 직책"
      />
      <span>{filteredMembers.length} / {viewMembers.length}</span>
    </section>

    <div class="member-table-wrap desktop-register">
      <table>
        <thead>
          <tr>
            <th scope="col">No.</th>
            <th scope="col">이름</th>
            <th scope="col">지위</th>
            <th scope="col">학과</th>
            <th scope="col">가입일</th>
            <th scope="col">주최 세미나</th>
            <th scope="col">주최 스터디</th>
            <th scope="col">임원 이력</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredMembers as member, index (member.id)}
            <tr>
              <td>{String(index + 1).padStart(3, "0")}</td>
              <th scope="row"
                ><a href={`/members/${member.id}`}>{member.name}</a></th
              >
              <td>
                <span
                  class="standing-chip"
                  class:current={inMemberView(member.standing, "current")}
                  >{MEMBER_STANDING_LABELS[member.standing]}</span
                >
              </td>
              <td>{member.department}</td>
              <td>{joinedLabel(member.joinedAt)}</td>
              <td class="count">{countLabel(member.hostedSeminars)}</td>
              <td class="count">{countLabel(member.hostedStudies)}</td>
              <td>
                {#each member.roles as role (`${role.term}-${role.title}`)}
                  <span class="role-chip">{role.term} {role.title}</span>
                {:else}
                  <span class="muted">—</span>
                {/each}
              </td>
            </tr>
          {:else}
            <tr
              ><td colspan="8" class="empty-state">검색 결과가 없습니다.</td
              ></tr
            >
          {/each}
        </tbody>
      </table>
    </div>

    <section class="mobile-register" aria-label="회원 명단">
      {#each filteredMembers as member, index (member.id)}
        <article class="member-card">
          <header>
            <span>{String(index + 1).padStart(3, "0")}</span>
            <div>
              <h2>
                <a href={`/members/${member.id}`}>{member.name}</a>
                <span
                  class="standing-chip"
                  class:current={inMemberView(member.standing, "current")}
                  >{MEMBER_STANDING_LABELS[member.standing]}</span
                >
              </h2>
              <p>{member.department}</p>
            </div>
            <time datetime={member.joinedAt ?? undefined}
              >{joinedLabel(member.joinedAt)}</time
            >
          </header>
          <p class="mobile-hosted">
            주최 세미나 {countLabel(member.hostedSeminars)} · 주최 스터디
            {countLabel(member.hostedStudies)}
          </p>
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

    <p class="freshness">
      조회 기준 {new Date(data.generatedAt).toLocaleString("ko-KR")}
    </p>
  {:else}
    <p class="unavailable">
      명단을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
    </p>
  {/if}
</article>

<style>
  .public-member-paper {
    width: min(100%, 1120px);
  }
  .intro-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .intro-row p {
    max-width: 48rem;
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.82rem;
    line-height: 1.65;
  }
  .view-toggle {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.6rem;
  }
  .search-panel {
    position: relative;
    margin-bottom: 0.9rem;
    padding: 0.85rem;
    border: 1px solid var(--latex-rule);
  }
  .search-panel input {
    width: 100%;
    padding-right: 5rem;
  }
  .search-panel > span {
    position: absolute;
    right: 1.5rem;
    bottom: 1.55rem;
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
  }
  .member-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--latex-rule);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
  }
  th,
  td {
    padding: 0.62rem 0.65rem;
    border-right: 1px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
    text-align: left;
    vertical-align: top;
  }
  tr:last-child th,
  tr:last-child td {
    border-bottom: 0;
  }
  th:last-child,
  td:last-child {
    border-right: 0;
  }
  thead th,
  tbody td:first-child {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  tbody th {
    font-size: 0.88rem;
    font-weight: 570;
  }
  tbody th a {
    color: var(--latex-text);
  }
  .count {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    white-space: nowrap;
  }
  .standing-chip {
    display: inline-flex;
    padding: 0.14rem 0.32rem;
    border: 1px solid var(--latex-rule);
    color: var(--latex-muted);
    font-size: 0.62rem;
    font-weight: 650;
    white-space: nowrap;
  }
  .standing-chip.current {
    border-color: var(--latex-text);
    color: var(--latex-text);
  }
  .role-chip {
    display: inline-flex;
    margin: 0 0.3rem 0.3rem 0;
    padding: 0.18rem 0.3rem;
    background: color-mix(in srgb, var(--latex-rule) 12%, transparent);
    font-size: 0.65rem;
    white-space: nowrap;
  }
  .muted {
    color: var(--latex-muted);
  }
  .mobile-register {
    display: none;
  }
  .empty-state,
  .unavailable {
    margin: 0;
    padding: 1.5rem;
    color: var(--latex-muted);
    text-align: center;
  }
  .unavailable {
    border: 1px dashed var(--latex-rule);
  }
  .freshness {
    margin: 0.8rem 0 0;
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.56rem;
    text-align: right;
    text-transform: uppercase;
  }
  @media (max-width: 720px) {
    .intro-row {
      align-items: stretch;
      flex-direction: column;
    }
    .intro-row a {
      width: 100%;
    }
    .view-toggle .paper-btn {
      flex: 1;
    }
    .desktop-register {
      display: none;
    }
    .mobile-register {
      display: grid;
      gap: 0.55rem;
    }
    .member-card {
      border: 1px solid var(--latex-rule);
    }
    .member-card header {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 0.65rem;
      align-items: start;
      padding: 0.7rem;
    }
    .member-card header > span,
    .member-card time {
      color: var(--latex-muted);
      font-family: var(--font-mono);
      font-size: 0.56rem;
    }
    .member-card h2,
    .member-card p {
      margin: 0;
    }
    .member-card h2 {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.98rem;
      font-weight: 570;
    }
    .member-card h2 a {
      color: var(--latex-text);
    }
    .mobile-hosted {
      margin: 0;
      padding: 0.5rem 0.7rem;
      border-top: 1px solid var(--latex-rule);
      color: var(--latex-muted);
      font-size: 0.66rem;
    }
    .member-card p {
      margin-top: 0.12rem;
      color: var(--latex-muted);
      font-size: 0.7rem;
    }
    .mobile-roles {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      padding: 0.6rem 0.7rem;
      border-top: 1px solid var(--latex-rule);
    }
    .mobile-roles span {
      font-size: 0.66rem;
    }
  }
  @media (max-width: 440px) {
    .member-card header {
      grid-template-columns: auto 1fr;
    }
    .member-card time {
      grid-column: 2;
    }
  }
</style>
