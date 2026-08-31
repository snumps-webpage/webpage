<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto, invalidateAll } from "$app/navigation";
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";

  let { data } = $props();
  const term = $derived(data.term);
  const titles = $derived(data.titles);
  const assignments = $derived(data.assignments);
  const candidates = $derived(data.candidates);

  let selectedTitle = $state<string | null>(null);
  let termInput = $state("");
  let addingTitle = $state(false);
  let notice = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);

  $effect(() => {
    termInput = term;
  });

  // 학기 빠른 선택: 전 학기 · 현재 · 다음 학기
  const termChips = $derived.by(() => {
    const [yy, half] = data.currentTerm.split("-").map(Number);
    const prev = half === 1 ? `${String(yy - 1).padStart(2, "0")}-2` : `${yy}-1`;
    const next = half === 1 ? `${yy}-2` : `${String(yy + 1).padStart(2, "0")}-1`;
    return [prev, data.currentTerm, next];
  });

  function submitAndRefresh(message: string) {
    return () =>
      async ({ result, update }: { result: { type: string; data?: { message?: string } }; update: () => Promise<void> }) => {
        if (result.type === "success") {
          notice = message;
          errorMessage = null;
          addingTitle = false;
          await invalidateAll();
        } else {
          errorMessage = result.data?.message ?? "처리하지 못했습니다.";
          await update();
        }
      };
  }

  const grouped = $derived.by(() => {
    const map = new Map<string, typeof assignments>();
    for (const a of assignments) {
      map.set(a.title, [...(map.get(a.title) ?? []), a]);
    }
    return map;
  });
</script>

<svelte:head><title>임원진 배정 · SNUMPS Admin</title></svelte:head>

<article class="paper-document exec-paper">
  <ManuscriptHeader title="임원진 배정" subtitle="Executive Assignment by Term" figure={MANUSCRIPT.FIGURES.ADMIN} />
  <AdminSectionNav />
  <p class="scope-note">
    학기와 직위를 고른 뒤 회원 옆의 <strong>배정</strong>을 누르세요. 배정은 회원 기록의 직책
    이력(roles)에 저장되고 감사 로그에 남습니다. 임원 축은 정규 학기(YY-1/YY-2) 단위입니다.
  </p>

  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}

  <section class="picker">
    <div class="picker-row">
      <span class="paper-label">학기</span>
      <div class="chips">
        {#each termChips as chip (chip)}
          <button
            type="button"
            class="chip"
            class:active={term === chip}
            onclick={() => goto(`?term=${chip}`, { keepFocus: true })}
          >{chip}{chip === data.currentTerm ? " (현재)" : ""}</button>
        {/each}
        <form
          class="term-free"
          onsubmit={(e) => {
            e.preventDefault();
            if (/^\d{2}-[12]$/.test(termInput)) goto(`?term=${termInput}`, { keepFocus: true });
            else errorMessage = "학기는 YY-1 또는 YY-2 형식으로 입력해 주세요.";
          }}
        >
          <input type="text" bind:value={termInput} pattern="\d{'{'}2{'}'}-[12]" aria-label="학기 직접 입력" />
          <button type="submit" class="paper-btn small">이동</button>
        </form>
      </div>
    </div>

    <div class="picker-row">
      <span class="paper-label">직위</span>
      <div class="chips">
        {#each titles as t (t.title)}
          <span class="title-chip-wrap">
            <button
              type="button"
              class="chip"
              class:active={selectedTitle === t.title}
              onclick={() => (selectedTitle = selectedTitle === t.title ? null : t.title)}
            >{t.title}</button>
            {#if t.isCustom}
              <form method="POST" action="?/removeTitle" use:enhance={submitAndRefresh(`'${t.title}' 옵션 제거`)}>
                <input type="hidden" name="title" value={t.title} />
                <button type="submit" class="chip-x" title="옵션 제거 (과거 배정 기록은 유지)">×</button>
              </form>
            {/if}
          </span>
        {/each}
        {#if addingTitle}
          <form method="POST" action="?/addTitle" class="term-free" use:enhance={submitAndRefresh("직위 옵션을 추가했습니다")}>
            <input type="text" name="title" required maxlength="20" placeholder="새 직위 이름" />
            <button type="submit" class="paper-btn small">추가</button>
            <button type="button" class="paper-btn small" onclick={() => (addingTitle = false)}>닫기</button>
          </form>
        {:else}
          <button type="button" class="chip add" onclick={() => (addingTitle = true)}>+ 직위 추가</button>
        {/if}
      </div>
    </div>
  </section>

  <section class="board">
    <h2>{term} 배정 현황</h2>
    {#if assignments.length === 0}
      <p class="empty">이 학기에 배정된 임원이 없습니다.</p>
    {:else}
      {#each [...grouped.entries()] as [title, list] (title)}
        <div class="group">
          <h3>{title}</h3>
          <ul>
            {#each list as a (a.memberId + a.title)}
              <li>
                <span>{a.memberName} <small>{a.department}</small></span>
                <form method="POST" action="?/unassign" use:enhance={submitAndRefresh(`${a.memberName} — ${title} 해제`)}>
                  <input type="hidden" name="memberId" value={a.memberId} />
                  <input type="hidden" name="term" value={term} />
                  <input type="hidden" name="title" value={title} />
                  <button type="submit" class="paper-btn small danger">해제</button>
                </form>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    {/if}
  </section>

  <section class="board">
    <h2>배정하기 {selectedTitle ? `— ${term} / ${selectedTitle}` : ""}</h2>
    {#if !selectedTitle}
      <p class="empty">위에서 직위를 먼저 선택하세요.</p>
    {:else if candidates.length === 0}
      <p class="empty">배정 가능한 회원이 없습니다 (운영 회원 DB 기준 — 재가입 승인된 회원만 후보).</p>
    {:else}
      <ul class="candidates">
        {#each candidates as c (c.id)}
          <li>
            <span>{c.name} <small>{c.department}</small>{#if !c.registered}<small class="unreg">미등록</small>{/if}</span>
            <form method="POST" action="?/assign" use:enhance={submitAndRefresh(`${c.name} — ${selectedTitle} 배정`)}>
              <input type="hidden" name="memberId" value={c.id} />
              <input type="hidden" name="term" value={term} />
              <input type="hidden" name="title" value={selectedTitle} />
              <button type="submit" class="paper-btn small">배정</button>
            </form>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</article>

<style>
  .exec-paper { width: min(100%, 880px); }
  .scope-note { margin: 0 0 1rem; color: var(--latex-muted); font-size: 0.78rem; line-height: 1.7; }
  .notice { padding: 0.5rem 0.7rem; border: 1px solid var(--latex-rule); font-size: 0.78rem; }
  .error { padding: 0.5rem 0.7rem; border: 1px solid var(--color-danger-text, #b00); color: var(--color-danger-text, #b00); font-size: 0.78rem; }
  .picker { border: 1px solid var(--latex-rule); padding: 0.8rem; display: grid; gap: 0.7rem; }
  .picker-row { display: grid; grid-template-columns: 3.5rem 1fr; gap: 0.6rem; align-items: start; }
  .picker-row > .paper-label { padding-top: 0.45rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .chip { padding: 0.35rem 0.7rem; border: 1px solid var(--latex-rule); background: transparent; color: var(--latex-text); font-family: var(--font-mono); font-size: 0.68rem; cursor: pointer; }
  .chip.active { background: var(--latex-text); color: var(--latex-bg); }
  .chip.add { border-style: dashed; color: var(--latex-muted); }
  .title-chip-wrap { display: inline-flex; align-items: center; gap: 0.1rem; }
  .title-chip-wrap form { margin: 0; }
  .chip-x { padding: 0.2rem 0.35rem; border: 0; background: transparent; color: var(--latex-muted); cursor: pointer; font-size: 0.8rem; }
  .chip-x:hover { color: var(--color-danger-text, #b00); }
  .term-free { display: inline-flex; gap: 0.35rem; align-items: center; }
  .term-free input { width: 7rem; padding: 0.3rem 0.5rem; font-size: 0.72rem; }
  .board { margin-top: 1.1rem; }
  .board h2 { margin: 0 0 0.5rem; font-size: 1rem; font-weight: 600; }
  .group h3 { margin: 0.7rem 0 0.3rem; font-size: 0.82rem; font-weight: 600; color: var(--latex-accent); }
  .board ul { margin: 0; padding: 0; list-style: none; border: 1px solid var(--latex-rule); }
  .board li { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; padding: 0.45rem 0.6rem; border-bottom: 1px solid var(--latex-rule); font-size: 0.8rem; }
  .board li:last-child { border-bottom: 0; }
  .board li form { margin: 0; }
  small { color: var(--latex-muted); margin-left: 0.35rem; }
  small.unreg { color: var(--latex-accent); }
  .candidates { max-height: 24rem; overflow-y: auto; }
  .empty { color: var(--latex-muted); font-size: 0.78rem; }
  .paper-btn.small { padding: 0.25rem 0.55rem; font-size: 0.62rem; }
  .paper-btn.danger { border-color: var(--color-danger-text, #b00); color: var(--color-danger-text, #b00); }
</style>
