<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT, RECORD_ACTIVITY_TYPES } from "$lib/constants";
  import { ACTIVE_WINDOW_DAYS } from "$lib/domain/member-activity";
  import { formatArchiveTerm } from "$lib/domain/public-content";

  let { data } = $props();
  const member = $derived(data.member);
  const activity = $derived(data.activity);

  /** 종류별 횟수 — 기록 종류의 순서대로, 그 밖의 종류는 뒤에. */
  const counts = $derived.by(() => {
    const known = RECORD_ACTIVITY_TYPES as readonly string[];
    return Object.entries(activity.countsByType).sort(
      ([a], [b]) =>
        (known.indexOf(a) + 1 || known.length + 1) -
        (known.indexOf(b) + 1 || known.length + 1),
    );
  });

  function joinedLabel(value: string | null) {
    return value
      ? new Date(`${value}T00:00:00`).toLocaleDateString("ko-KR")
      : "기록 없음";
  }

  function dateLabel(value: string) {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  }
</script>

<svelte:head>
  <title>{member.name} · 회원 명단 · 서울대학교 수학문제연구회</title>
  <meta
    name="description"
    content="{member.name} 회원의 임원 이력과 세미나·스터디 주최, 활동 참석 기록입니다."
  />
</svelte:head>

<article class="paper-document detail-paper">
  <ManuscriptHeader
    title={member.name}
    subtitle="Public Member Record"
    figure={MANUSCRIPT.FIGURES.PUBLIC_MEMBERS}
  />

  <dl class="metadata-grid">
    <div>
      <dt>학과</dt>
      <dd>{member.department || "기록 없음"}</dd>
    </div>
    <div>
      <dt>가입일</dt>
      <dd>{joinedLabel(member.joinedAt)}</dd>
    </div>
    <div>
      <dt>활동</dt>
      <dd>
        {#if activity.active}
          <span class="active-chip">활동 회원</span>
        {:else}
          <span class="muted">최근 {ACTIVE_WINDOW_DAYS}일 참석 없음</span>
        {/if}
      </dd>
    </div>
    <div>
      <dt>임원 이력</dt>
      <dd>
        {#each member.roles as role (`${role.term}-${role.title}`)}
          <span class="role-chip">{role.term} {role.title}</span>
        {:else}
          <span class="muted">—</span>
        {/each}
      </dd>
    </div>
  </dl>

  <section class="record-section">
    <h2>1. 주최 세미나</h2>
    {#if activity.hostedSeminars.length}
      <ul class="record-list">
        {#each activity.hostedSeminars as seminar (seminar.id)}
          <li>
            <a href={`/archive/seminars/${seminar.id}`}>{seminar.title}</a>
            <span>{formatArchiveTerm(seminar.semester)}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">주최한 세미나 기록이 없습니다.</p>
    {/if}
  </section>

  <section class="record-section">
    <h2>2. 주최 스터디</h2>
    {#if activity.hostedStudies.length}
      <ul class="record-list">
        {#each activity.hostedStudies as study (study.id)}
          <li>
            <span class="record-title">{study.title}</span>
            <span>{formatArchiveTerm(study.semester)}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">주최한 스터디 기록이 없습니다.</p>
    {/if}
  </section>

  <section class="record-section">
    <h2>3. 참석 활동</h2>
    {#if activity.attended.length}
      <div class="count-row" aria-label="종류별 참석 횟수">
        <span class="count-chip">전체 {activity.attended.length}</span>
        {#each counts as [type, count] (type)}
          <span class="count-chip">{type} {count}</span>
        {/each}
      </div>
      <ul class="record-list">
        {#each activity.attended as item (item.id)}
          <li>
            <span class="record-title">{item.title}</span>
            <span
              >{item.type} ·
              <time datetime={item.start}>{dateLabel(item.start)}</time></span
            >
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">참석한 활동 기록이 없습니다.</p>
    {/if}
  </section>

  <a class="paper-btn" href="/members">← 회원 명단</a>
  <p class="freshness">
    조회 기준 {new Date(data.generatedAt).toLocaleString("ko-KR")}
  </p>
</article>

<style>
  .detail-paper {
    width: min(100%, 880px);
  }
  .metadata-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin: 0 0 1.4rem;
    border-top: 2px solid var(--latex-rule);
    border-bottom: 2px solid var(--latex-rule);
  }
  .metadata-grid > div {
    display: grid;
    grid-template-columns: 6rem 1fr;
    padding: 0.62rem 0.7rem;
    border-bottom: 1px solid var(--latex-rule);
  }
  .metadata-grid > div:nth-last-child(-n + 2) {
    border-bottom: 0;
  }
  dt {
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
  }
  dd {
    margin: 0;
    font-size: 0.8rem;
  }
  .role-chip,
  .count-chip {
    display: inline-flex;
    margin: 0 0.3rem 0.3rem 0;
    padding: 0.18rem 0.3rem;
    background: color-mix(in srgb, var(--latex-rule) 12%, transparent);
    font-size: 0.65rem;
    white-space: nowrap;
  }
  .active-chip {
    display: inline-flex;
    padding: 0.14rem 0.32rem;
    border: 1px solid var(--latex-text);
    font-size: 0.65rem;
    font-weight: 650;
  }
  .muted {
    color: var(--latex-muted);
  }
  .record-section {
    margin: 1.2rem 0;
    padding-top: 0.8rem;
    border-top: 1px solid var(--latex-rule);
  }
  .record-section h2 {
    margin: 0 0 0.55rem;
    font-size: 1.05rem;
    font-weight: 570;
  }
  .count-row {
    display: flex;
    flex-wrap: wrap;
    margin-bottom: 0.4rem;
  }
  .record-list {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--latex-rule);
  }
  .record-list li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.55rem 0.7rem;
    border-bottom: 1px solid var(--latex-rule);
    font-size: 0.82rem;
  }
  .record-list li:last-child {
    border-bottom: 0;
  }
  .record-list a {
    color: var(--latex-text);
  }
  .record-list li > span:last-child {
    flex-shrink: 0;
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    text-align: right;
  }
  .empty {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.82rem;
  }
  .freshness {
    margin: 0.8rem 0 0;
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.56rem;
    text-align: right;
    text-transform: uppercase;
  }
  @media (max-width: 680px) {
    .metadata-grid {
      grid-template-columns: 1fr;
    }
    .metadata-grid > div,
    .metadata-grid > div:nth-last-child(-n + 2) {
      border-bottom: 1px solid var(--latex-rule);
    }
    .metadata-grid > div:last-child {
      border-bottom: 0;
    }
    .record-list li {
      flex-direction: column;
      gap: 0.2rem;
    }
    .record-list li > span:last-child {
      text-align: left;
    }
  }
</style>
