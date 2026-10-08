<script lang="ts">
  import {
    filterPublicIndex,
    seminarIndexItems,
    type PublicSeminarRecord,
  } from "$lib/domain/public-content";
  import { publicSeminarSchedule } from "$lib/domain/public-seminar";

  let {
    records,
  }: {
    records: (PublicSeminarRecord & { startTimeKnown?: boolean })[];
  } = $props();
  let query = $state("");
  const items = $derived(seminarIndexItems(records));
  const filtered = $derived(filterPublicIndex(items, query));
  const byId = $derived(new Map(records.map((record) => [record.id, record])));
  let searchInput: HTMLInputElement;

  function clearSearch() {
    query = "";
    searchInput?.focus();
  }
</script>

<section class="seminar-search" aria-label="세미나 기록 검색">
  <label for="seminar-record-search">세미나 검색</label>
  <div class="seminar-search-row">
    <input
      id="seminar-record-search"
      type="search"
      bind:this={searchInput}
      bind:value={query}
      placeholder="제목, 학기, 발표자 또는 핵심어"
      aria-describedby="seminar-search-help"
    />
    {#if query}<button type="button" onclick={clearSearch}>검색 지우기</button
      >{/if}
  </div>
  <p id="seminar-search-help">
    제목·학기·발표자·소개·선수지식·장소에 적힌 내용을 찾습니다.
  </p>
  <p class="seminar-search-count" role="status" aria-live="polite">
    {query ? "검색 결과" : "공개 세미나"}
    {filtered.length}건
  </p>
</section>

<section class="seminar-records" aria-label="공개 세미나 목록">
  {#each filtered as item (item.id)}
    {@const record = byId.get(item.id)}
    {#if record}
      {@const schedule = publicSeminarSchedule(
        record.scheduledAt,
        record.startTimeKnown,
      )}
      <article class="seminar-index-record">
        <p class="seminar-term">{item.eyebrow}</p>
        <h2><a href={item.href}>{item.title}</a></h2>
        <dl class="seminar-index-facts">
          <div>
            <dt>발표자</dt>
            <dd>{record.presenterNames.join(", ") || "기록 없음"}</dd>
          </div>
          <div>
            <dt>일정</dt>
            <dd>
              {#if schedule.dateTime}<time datetime={schedule.dateTime}
                  >{schedule.text}</time
                >{:else}{schedule.text}{/if}
              {#if record.scheduledAt && !schedule.timeKnown}<span
                  class="time-unknown">시각 기록 없음</span
                >{/if}
            </dd>
          </div>
          <div>
            <dt>선수지식</dt>
            <dd>{record.prerequisites || "기록 없음"}</dd>
          </div>
          <div>
            <dt>장소</dt>
            <dd>{record.location || "기록 없음"}</dd>
          </div>
        </dl>
        {#if item.description}<p class="seminar-index-description">
            {item.description}
          </p>{/if}
        <a class="seminar-detail-link" href={item.href}
          >발표 소개·공개 자료 보기 <span aria-hidden="true">→</span></a
        >
      </article>
    {/if}
  {:else}
    <div class="seminar-index-empty">
      {#if query}
        <h2>검색에 맞는 세미나가 없습니다</h2>
        <p>
          다른 제목이나 발표자로 찾아보거나, 검색을 지워 전체 기록을 확인해
          주세요.
        </p>
        <button type="button" onclick={clearSearch}>검색 지우기</button>
      {:else}
        <h2>아직 공개된 세미나 기록이 없습니다</h2>
        <p>
          다른 활동은 <a href="/archive">활동 기록</a>에서 살펴볼 수 있습니다.
        </p>
      {/if}
    </div>
  {/each}
</section>

<style>
  .seminar-search {
    margin: 1.7rem 0 1.4rem;
    font-family: var(--font-ui);
  }
  label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.87rem;
    font-weight: 650;
  }
  .seminar-search-row {
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }
  input {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 46px;
    padding: 0.65rem 0.8rem;
    border: 1px solid var(--latex-muted);
    font: 0.93rem/1.6 var(--font-ui);
  }
  button {
    flex: 0 0 auto;
    min-height: 46px;
    padding: 0.6rem 0.8rem;
    background: transparent;
    color: var(--latex-text);
    border: 1px solid var(--latex-muted);
    font: 0.86rem/1.6 var(--font-ui);
    cursor: pointer;
  }
  #seminar-search-help {
    margin: 0.6rem 0 0;
    color: var(--latex-muted);
    font-size: 0.83rem;
    line-height: 1.8;
  }
  .seminar-search-count {
    margin: 0.8rem 0 0;
    color: var(--latex-muted);
    font-size: 0.84rem;
  }
  .seminar-records {
    border-top: 1px solid var(--latex-rule);
  }
  .seminar-index-record {
    padding: 1.6rem 0;
    border-bottom: 1px solid var(--latex-rule);
  }
  .seminar-term {
    margin: 0 0 0.35rem;
    color: var(--latex-muted);
    font-size: 0.78rem;
  }
  h2 {
    margin: 0;
    font: 550 1.45rem/1.65 var(--font-display);
  }
  h2 a {
    color: var(--latex-text);
    text-decoration-thickness: 1px;
    text-underline-offset: 0.2em;
  }
  .seminar-index-facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem 1.8rem;
    margin: 1rem 0 0;
  }
  .seminar-index-facts > div {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr);
    gap: 0.5rem;
  }
  dt {
    color: var(--latex-muted);
    font-size: 0.8rem;
  }
  dd {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.75;
    overflow-wrap: anywhere;
  }
  .time-unknown {
    display: block;
    color: var(--latex-muted);
    font-size: 0.78rem;
  }
  .seminar-index-description {
    max-width: 46rem;
    margin: 1rem 0 0;
    color: var(--latex-muted);
    font-size: 0.93rem;
    line-height: 1.9;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
  .seminar-detail-link {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    min-height: 44px;
    margin-top: 0.6rem;
    color: var(--latex-text);
    font-size: 0.87rem;
    text-underline-offset: 0.2em;
  }
  .seminar-index-empty {
    padding: 1.5rem 0;
  }
  .seminar-index-empty h2 {
    font-size: 1.2rem;
  }
  .seminar-index-empty p {
    color: var(--latex-muted);
    font-size: 0.91rem;
    line-height: 1.8;
  }
  .seminar-index-empty a {
    color: var(--latex-text);
  }
  a:focus-visible,
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--latex-text);
    outline-offset: 3px;
  }
  @media (max-width: 620px) {
    .seminar-index-facts {
      grid-template-columns: 1fr;
      gap: 0.55rem;
    }
    h2 {
      font-size: 1.3rem;
    }
    .seminar-search-row {
      align-items: stretch;
    }
    button {
      padding: 0.6rem;
      font-size: 0.82rem;
    }
  }
</style>
