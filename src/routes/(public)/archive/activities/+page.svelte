<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import PublicDirectoryNav from "$lib/components/public/PublicDirectoryNav.svelte";
  import { ACTIVITY_TYPES, MANUSCRIPT, type ActivityType } from "$lib/constants";
  import { ARCHIVE_NAV } from "$lib/public-navigation";

  let { data } = $props();
  let query = $state("");
  let selectedType = $state<"all" | ActivityType>("all");
  const activities = $derived.by(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return [...data.archive.activities]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((activity) => selectedType === "all" || activity.type === selectedType)
      .filter((activity) => !normalized || [activity.title, activity.type, activity.date].some((value) => value.toLocaleLowerCase("ko-KR").includes(normalized)));
  });

  function dateLabel(value: string) {
    // value is a full ISO datetime from the activities table, or a bare date.
    const parsed = new Date(value.includes("T") ? value : `${value}T00:00:00+09:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(parsed);
  }
</script>

<svelte:head><title>활동 대장 · SNUMPS 아카이브</title><meta name="description" content="참석자 명단을 제외한 SNUMPS 공개 활동 연대기입니다." /></svelte:head>

<article class="paper-document activity-paper">
  <ManuscriptHeader title="활동 대장" subtitle="Public Activity Ledger" figure={MANUSCRIPT.FIGURES.ARCHIVE_ACTIVITIES} />
  <PublicDirectoryNav items={[...ARCHIVE_NAV]} label="활동 아카이브 탐색" />
  <p class="scope-note">기존 활동 유형을 그대로 유지하며, 공개 화면에는 참석자 명단이나 ID를 절대 포함하지 않습니다.</p>

  {#if data.dataAvailable}
    <section class="filters" aria-label="활동 필터">
      <label><span class="paper-label">검색</span><input type="search" bind:value={query} placeholder="제목, 날짜 또는 유형" /></label>
      <label><span class="paper-label">활동 유형</span><select bind:value={selectedType}><option value="all">전체</option>{#each ACTIVITY_TYPES as type (type)}<option value={type}>{type}</option>{/each}</select></label>
      <span>{activities.length} / {data.archive.activities.length}</span>
    </section>

    <div class="paper-table-container">
      <table class="paper-table">
        <thead><tr><th scope="col">날짜</th><th scope="col">유형</th><th scope="col">활동명</th></tr></thead>
        <tbody>
          {#each activities as activity (activity.id)}
            <tr><td><time datetime={activity.date}>{dateLabel(activity.date)}</time></td><td><span class="tag">{activity.type}</span></td><th scope="row">{activity.title}</th></tr>
          {:else}<tr><td colspan="3" class="empty-cell">검색 조건에 맞는 활동이 없습니다.</td></tr>{/each}
        </tbody>
      </table>
    </div>
  {:else}<p class="empty">데이터 이관 후 기록이 표시됩니다.</p>{/if}
</article>

<style>
  .activity-paper { width: min(100%, 980px); }
  .scope-note { margin: 0 0 1rem; color: var(--latex-muted); font-size: 0.78rem; }
  .filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(10rem, 0.45fr) auto; gap: 0.7rem; align-items: end; padding: 0.8rem; border: 1px solid var(--latex-rule); }
  .filters input, .filters select { width: 100%; min-height: 2.6rem; padding: 0.55rem 0.65rem; }
  .filters > span { padding-bottom: 0.6rem; color: var(--latex-muted); font-family: var(--font-mono); font-size: 0.6rem; font-weight: 700; }
  .paper-table tbody th { font-weight: 570; }
  .paper-table time { white-space: nowrap; }
  .empty-cell { padding: 2rem !important; color: var(--latex-muted) !important; text-align: center; }
  @media (max-width: 650px) { .filters { grid-template-columns: 1fr; }.filters > span { padding: 0; text-align: right; } }
</style>
