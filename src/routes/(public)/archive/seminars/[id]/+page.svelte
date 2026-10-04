<script lang="ts">
  import { formatArchiveTerm } from "$lib/domain/public-content";
  import {
    publicSeminarFiles,
    publicSeminarSchedule,
  } from "$lib/domain/public-seminar";
  import { thumbSrcset, thumbUrl } from "$lib/image";
  let { data } = $props();
  const seminar = $derived(data.seminar);
  const presenters = $derived([
    ...seminar.presenters,
    ...(seminar.externalPresenters ? [seminar.externalPresenters] : []),
  ]);
  const schedule = $derived(
    publicSeminarSchedule(seminar.scheduledAt, seminar.startTimeKnown),
  );
  const files = $derived(publicSeminarFiles(seminar.materials));
  const photos = $derived(seminar.photos.filter(Boolean));
</script>

<svelte:head><title>{seminar.title} · 세미나 기록 · SNUMPS</title></svelte:head>

<article class="paper-document public-seminar-detail">
  <nav class="seminar-breadcrumbs" aria-label="현재 위치">
    <a href="/archive">활동 기록</a><span aria-hidden="true">/</span><a
      href="/archive/seminars">세미나 기록</a
    >
  </nav>
  <header class="seminar-detail-heading">
    <p class="seminar-detail-term">
      {formatArchiveTerm(seminar.semester)} · 공개 세미나
    </p>
    <h1>{seminar.title}</h1>
    <dl class="seminar-primary-facts">
      <div>
        <dt>발표자</dt>
        <dd>{presenters.join(", ") || "기록 없음"}</dd>
      </div>
      <div>
        <dt>일정</dt>
        <dd>
          {#if schedule.dateTime}<time datetime={schedule.dateTime}
              >{schedule.text}</time
            >{:else}{schedule.text}{/if}
          {#if seminar.scheduledAt && !schedule.timeKnown}<span
              class="time-unknown">시각 기록 없음</span
            >{/if}
        </dd>
      </div>
      <div>
        <dt>소요 시간</dt>
        <dd>{seminar.duration || "기록 없음"}</dd>
      </div>
      <div>
        <dt>선수지식</dt>
        <dd>{seminar.prerequisites || "기록 없음"}</dd>
      </div>
    </dl>
  </header>

  <nav class="seminar-section-links" aria-label="발표 기록 바로가기">
    <a href="#seminar-overview">발표 소개</a><a href="#seminar-materials"
      >공개 자료</a
    >{#if photos.length}<a href="#seminar-photos">활동 사진</a>{/if}
  </nav>

  <section class="seminar-detail-section" aria-labelledby="seminar-overview">
    <p class="seminar-section-number">§ 01</p>
    <h2 id="seminar-overview">발표 소개</h2>
    <p class="seminar-overview-text">
      {seminar.description || "등록된 발표 소개가 없습니다."}
    </p>
    {#if seminar.posterUrl}
      <details class="seminar-poster">
        <summary>발표 포스터 보기</summary>
        <a
          href={seminar.posterUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${seminar.title} 포스터 원본 (새 창)`}
        >
          <img
            src={thumbUrl(seminar.posterUrl, 480)}
            srcset={thumbSrcset(seminar.posterUrl)}
            sizes="(max-width:480px) 100vw,480px"
            alt={`${seminar.title} 포스터`}
            loading="lazy"
            decoding="async"
          />
        </a>
      </details>
    {/if}
  </section>

  <section class="seminar-detail-section" aria-labelledby="seminar-materials">
    <p class="seminar-section-number">§ 02</p>
    <h2 id="seminar-materials">공개 자료</h2>
    {#if files.length}
      <ul class="seminar-file-list">
        {#each files as file (file.key)}
          <li>
            {#if file.href}<a
                href={file.href}
                target="_blank"
                rel="noopener noreferrer"
                ><span class="file-name">{file.name}</span><span
                  class="file-kind"
                  >{file.kind} · 새 창 <span aria-hidden="true">↗</span></span
                ></a
              >{:else}<div class="file-unavailable">
                <span class="file-name">{file.name}</span><span
                  >자료 연결이 아직 없습니다.</span
                >
              </div>{/if}
          </li>
        {/each}
      </ul>
    {:else}<p class="seminar-empty-materials">
        등록된 공개 자료가 없습니다.
      </p>{/if}
  </section>

  {#if photos.length}
    <section class="seminar-detail-section" aria-labelledby="seminar-photos">
      <p class="seminar-section-number">§ 03</p>
      <h2 id="seminar-photos">활동 사진</h2>
      <div class="seminar-photo-grid">
        {#each photos as photo, index (index)}
          {#if photo}<a
              href={photo}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${seminar.title} 활동 사진 ${index + 1} (새 창)`}
              ><img
                src={thumbUrl(photo, 960)}
                srcset={thumbSrcset(photo)}
                sizes="(max-width:680px) 100vw,50vw"
                alt={`${seminar.title} 활동 사진 ${index + 1}`}
                loading="lazy"
                decoding="async"
              /></a
            >{/if}
        {/each}
      </div>
    </section>
  {/if}
  <div class="seminar-detail-footer">
    <a href="/archive/seminars">← 세미나 목록으로</a><a href="/archive"
      >다른 활동 기록 보기</a
    >
  </div>
</article>

<style>
  .public-seminar-detail {
    width: min(100%, 920px);
    font-family: var(--font-ui);
  }
  .seminar-breadcrumbs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
    align-items: center;
    margin: 0 0 1rem;
    font-size: 0.84rem;
    color: var(--latex-muted);
  }
  .seminar-breadcrumbs a,
  .seminar-section-links a,
  .seminar-detail-footer a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--latex-text);
    text-underline-offset: 0.2em;
  }
  .seminar-detail-heading {
    border-top: 2px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
    padding: 1rem 0 1.5rem;
  }
  .seminar-detail-term,
  .seminar-section-number {
    margin: 0 0 0.4rem;
    font-size: 0.77rem;
    color: var(--latex-muted);
    font-weight: 650;
  }
  h1 {
    margin: 0;
    font: 550 clamp(1.8rem, 3.2vw, 2.3rem)/1.55 var(--font-display);
    overflow-wrap: anywhere;
  }
  .seminar-primary-facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.9rem 2rem;
    margin: 1.3rem 0 0;
  }
  .seminar-primary-facts > div {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr);
    gap: 0.6rem;
  }
  dt {
    color: var(--latex-muted);
    font-size: 0.82rem;
  }
  dd {
    margin: 0;
    font-size: 0.94rem;
    line-height: 1.8;
    overflow-wrap: anywhere;
  }
  .time-unknown {
    display: block;
    color: var(--latex-muted);
    font-size: 0.8rem;
  }
  .seminar-section-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1.4rem;
    margin: 0.75rem 0 1.4rem;
    font-size: 0.87rem;
  }
  .seminar-detail-section {
    margin-top: 2rem;
  }
  h2 {
    margin: 0 0 0.95rem;
    font: 550 1.45rem/1.6 var(--font-display);
  }
  .seminar-overview-text {
    margin: 0;
    max-width: 46rem;
    font-size: 1rem;
    line-height: 2;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
  .seminar-poster {
    margin-top: 1.2rem;
    border-top: 1px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
  }
  summary {
    padding: 0.85rem 0;
    min-height: 44px;
    color: var(--latex-text);
    font-size: 0.9rem;
    cursor: pointer;
  }
  .seminar-poster img {
    display: block;
    width: 100%;
    max-width: 480px;
    height: auto;
    margin: 0.5rem auto 1rem;
  }
  .seminar-file-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--latex-rule);
  }
  .seminar-file-list li {
    border-bottom: 1px solid var(--latex-rule);
  }
  .seminar-file-list a,
  .file-unavailable {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.2rem;
    padding: 0.95rem 0.25rem;
    min-height: 52px;
    color: var(--latex-text);
    text-decoration: none;
  }
  .file-name {
    min-width: 0;
    font-size: 0.94rem;
    line-height: 1.75;
    overflow-wrap: anywhere;
  }
  .file-kind {
    flex: 0 0 auto;
    color: var(--latex-muted);
    font-size: 0.78rem;
  }
  .seminar-file-list a:hover .file-name {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .file-unavailable > span:last-child,
  .seminar-empty-materials {
    color: var(--latex-muted);
    font-size: 0.91rem;
    line-height: 1.8;
  }
  .seminar-photo-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  .seminar-photo-grid img {
    display: block;
    width: 100%;
    aspect-ratio: 4/3;
    object-fit: cover;
  }
  .seminar-detail-footer {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 1.5rem;
    border-top: 1px solid var(--latex-rule);
    padding-top: 1rem;
    margin-top: 2.5rem;
    font-size: 0.87rem;
  }
  a:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--latex-text);
    outline-offset: 4px;
  }
  @media (max-width: 680px) {
    .seminar-primary-facts,
    .seminar-photo-grid {
      grid-template-columns: 1fr;
    }
    h2 {
      font-size: 1.3rem;
    }
    .seminar-file-list a,
    .file-unavailable {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.25rem;
    }
  }
</style>
