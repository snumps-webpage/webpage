<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import type { AdminMemberListItem } from "$lib/domain/members";
  import { MANUSCRIPT } from "$lib/constants";

  let { data } = $props();
  let query = $state("");

  const filteredMembers = $derived.by(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return data.members;
    return data.members.filter((member: AdminMemberListItem) =>
      [
        member.name,
        member.department,
        member.status,
        ...member.roles.flatMap((role) => [role.term, role.title]),
      ].some((value) => value.toLocaleLowerCase("ko-KR").includes(normalized)),
    );
  });

  function statusLabel(status: AdminMemberListItem["status"]) {
    return { associate: "준회원", regular: "정회원", withdrawn: "탈퇴" }[status];
  }

  function contactLabel(status: AdminMemberListItem["publicContactStatus"]) {
    return { granted: "공개", revoked: "철회", unset: "미설정" }[status];
  }
</script>

<svelte:head><title>회원·역할 관리 · SNUMPS 관리자</title></svelte:head>

<article class="paper-document admin-members-paper">
  <ManuscriptHeader
    title="회원·역할 관리"
    subtitle="Member and Role Index"
    figure={MANUSCRIPT.FIGURES.ADMIN_MEMBERS}
  />

  <div class="page-toolbar">
    <p>직책과 관리자 권한은 회원 데이터에서 관리합니다. 이름 비교나 하드코딩된 권한은 사용하지 않습니다.</p>
    <a href="/admin" class="paper-btn">전체 관리자 화면</a>
  </div>

  <section class="member-index">
    <label class="paper-label" for="member-search">회원 검색</label>
    <input
      id="member-search"
      type="search"
      bind:value={query}
      placeholder="이름, 학과, 지위, 학기 또는 직책"
    />
    <span>{filteredMembers.length} / {data.members.length}</span>
  </section>

  <section class="member-list" aria-label="회원 목록">
    {#each filteredMembers as member (member.id)}
      <article class="member-card">
        <header>
          <div>
            <p>{statusLabel(member.status)} · {member.department}</p>
            <h2>{member.name}</h2>
          </div>
          <div class="badges">
            {#if member.isAdmin}<span class="badge admin">Admin</span>{/if}
            <span class="badge">연락처 {contactLabel(member.publicContactStatus)}</span>
          </div>
        </header>
        <div class="role-list">
          {#each member.roles as role (`${role.term}-${role.title}`)}
            <span>{role.term} · {role.title}</span>
          {:else}
            <span class="empty-role">직책 없음</span>
          {/each}
        </div>
        <footer>
          <span>가입 {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString("ko-KR") : "기록 없음"}</span>
          <a class="paper-btn primary small" href={`/admin/members/${member.id}`}>권한 기록 열기</a>
        </footer>
      </article>
    {:else}
      <p class="empty-state">검색 조건에 맞는 회원이 없습니다.</p>
    {/each}
  </section>

  <p class="freshness">프리뷰 데이터 기준 {new Date(data.generatedAt).toLocaleString("ko-KR")}</p>
</article>

<style>
  .admin-members-paper { width: min(100%, 1120px); }
  .page-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    padding-bottom: 0.8rem;
    border-bottom: 1px solid var(--latex-rule);
  }
  .page-toolbar p { max-width: 48rem; margin: 0; color: var(--latex-muted); font-size: 0.84rem; line-height: 1.6; }
  .member-index { position: relative; margin-bottom: 0.9rem; padding: 0.85rem; border: 1px solid var(--latex-rule); }
  .member-index input { width: 100%; margin-top: 0.3rem; padding-right: 5rem; }
  .member-index > span {
    position: absolute;
    right: 1.45rem;
    bottom: 1.55rem;
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
  }
  .member-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
  .member-card { display: grid; gap: 0.75rem; padding: 0.9rem; border: 1px solid var(--latex-rule); }
  .member-card header,
  .member-card footer { display: flex; align-items: start; justify-content: space-between; gap: 0.75rem; }
  .member-card header p,
  .member-card h2,
  .freshness { margin: 0; }
  .member-card header p,
  .member-card footer > span,
  .freshness {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .member-card h2 { margin-top: 0.18rem; font-size: 1.1rem; font-weight: 570; }
  .badges { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.3rem; }
  .badge { padding: 0.2rem 0.35rem; border: 1px solid var(--latex-rule); color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.53rem; font-weight: 700; text-transform: uppercase; }
  .badge.admin { border-color: var(--latex-text); color: var(--latex-text); }
  .role-list { display: flex; flex-wrap: wrap; gap: 0.35rem; min-height: 1.55rem; padding-top: 0.65rem; border-top: 1px solid var(--latex-rule); }
  .role-list span { padding: 0.28rem 0.4rem; background: color-mix(in srgb, var(--latex-rule) 12%, transparent); font-size: 0.68rem; }
  .role-list .empty-role { color: var(--latex-muted); background: transparent; }
  .member-card footer { align-items: center; }
  .empty-state { grid-column: 1 / -1; margin: 0; padding: 1.5rem; border: 1px dashed var(--latex-rule); color: var(--latex-muted); text-align: center; }
  .freshness { margin-top: 1rem; text-align: right; }
  @media (max-width: 760px) {
    .page-toolbar { align-items: stretch; flex-direction: column; }
    .page-toolbar a { width: 100%; }
    .member-list { grid-template-columns: 1fr; }
  }
  @media (max-width: 460px) {
    .member-card header,
    .member-card footer { align-items: stretch; flex-direction: column; }
    .badges { justify-content: flex-start; }
    .member-card footer a { width: 100%; }
  }
</style>
