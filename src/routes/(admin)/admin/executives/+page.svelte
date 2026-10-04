<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import { tick, untrack } from "svelte";
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import {
    executiveActionUrl,
    executiveNotice,
    type AdminUtilityActionState,
  } from "$lib/domain/admin-utility-state";
  import { MANUSCRIPT } from "$lib/constants";

  let { data, form } = $props();
  const term = $derived(data.term);
  const titles = $derived(data.titles);
  const assignments = $derived(data.assignments);
  const candidates = $derived(data.candidates);
  const selectedTitle = $derived(data.selectedTitle);
  const actionState = $derived(form as AdminUtilityActionState | null);
  let pending = $state<{ token: symbol; context: string } | null>(null);
  let transient = $state<{ tone: "error"; message: string } | null>(null);
  const busy = $derived(pending !== null);
  const notice = $derived(transient ?? executiveNotice(actionState));
  const context = $derived(`${term}/${selectedTitle}`);
  let scope = untrack(() => context);
  $effect(() => {
    const current = context;
    untrack(() => {
      if (current !== scope) {
        scope = current;
        pending = null;
        transient = null;
      }
    });
  });
  const termChips = $derived.by(() => {
    const [yy, half] = data.currentTerm.split("-").map(Number);
    const prev =
      half === 1 ? `${String(yy - 1).padStart(2, "0")}-2` : `${yy}-1`;
    const next =
      half === 1 ? `${yy}-2` : `${String(yy + 1).padStart(2, "0")}-1`;
    return [prev, data.currentTerm, next];
  });
  function termUrl(value: string) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams({ term: value });
    if (selectedTitle) params.set("title", selectedTitle);
    return `?${params}`;
  }
  const actionUrl = (action: string) =>
    executiveActionUrl(action, term, selectedTitle);
  const submit: SubmitFunction = ({ cancel }) => {
    if (pending) {
      cancel();
      return;
    }
    const request = { token: Symbol(), context };
    pending = request;
    transient = null;
    return async ({ result, update }) => {
      try {
        if (context !== request.context || pending?.token !== request.token)
          return;
        if (result.type === "success") await update({ reset: false });
        else if (result.type === "failure")
          await update({ reset: false, invalidateAll: false });
        else if (result.type === "redirect") {
          await update();
          return;
        } else
          transient = {
            tone: "error",
            message:
              "처리 결과를 확인하지 못했습니다. 새로고침해 현재 상태를 확인해 주세요.",
          };
      } catch {
        if (context === request.context)
          transient = {
            tone: "error",
            message:
              "처리 후 상태를 확인하지 못했습니다. 새로고침해 확인해 주세요.",
          };
      } finally {
        if (pending?.token === request.token) pending = null;
      }
      await tick();
      document.querySelector<HTMLElement>("[data-executive-result]")?.focus();
    };
  };
  const grouped = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<string, typeof assignments>();
    for (const a of assignments)
      map.set(a.title, [...(map.get(a.title) ?? []), a]);
    return map;
  });
</script>

<svelte:head><title>임원진 배정 · SNUMPS Admin</title></svelte:head>

<article class="paper-document exec-paper">
  <ManuscriptHeader
    title="임원진 배정"
    subtitle="Executive Assignment by Term"
    figure={MANUSCRIPT.FIGURES.ADMIN}
  />
  <AdminSectionNav />
  <p class="scope-note">
    학기와 직위를 고른 뒤 회원 옆의 <strong>배정</strong>을 누르세요. 배정은
    회원 기록의 직책 이력(roles)에 저장되고 감사 로그에 남습니다. 임원 축은 정규
    학기(YY-1/YY-2) 단위입니다.
  </p>

  {#if notice}<p
      class:notice={notice.tone === "success"}
      class:error={notice.tone === "error"}
      data-executive-result
      tabindex="-1"
      role={notice.tone === "error" ? "alert" : "status"}
    >
      {notice.message}
    </p>{/if}

  <section class="picker">
    <form method="GET" class="selection-form">
      <label
        ><span class="paper-label">학기</span><input
          name="term"
          value={term}
          pattern={"[0-9]{2}-[12]"}
          required
          disabled={busy}
        /></label
      >
      <label
        ><span class="paper-label">직위</span><select
          name="title"
          value={selectedTitle}
          disabled={busy}
          ><option value="" selected={!selectedTitle}>직위 선택</option
          >{#each titles as t (t.title)}<option
              value={t.title}
              selected={selectedTitle === t.title}>{t.title}</option
            >{/each}</select
        ></label
      >
      <button class="paper-btn" disabled={busy}>배정 대상 조회</button>
    </form>
    <nav class="chips" aria-label="학기 빠른 선택">
      {#each termChips as chip (chip)}<a
          class="chip"
          class:active={term === chip}
          href={termUrl(chip)}
          aria-disabled={busy}
          onclick={(event) => {
            if (busy) event.preventDefault();
          }}>{chip}{chip === data.currentTerm ? " (현재)" : ""}</a
        >{/each}
    </nav>
    <details
      class="title-options"
      open={actionState?.action === "addTitle" && !!actionState.error}
    >
      <summary>직위 옵션 관리</summary>
      <p class="empty">옵션을 제거해도 과거 배정 기록은 유지합니다.</p>
      <div class="chips">
        {#each titles as t (t.title)}<span class="title-chip-wrap"
            ><span class="chip">{t.title}</span>{#if t.isCustom}<form
                method="POST"
                action={actionUrl("removeTitle")}
                use:enhance={submit}
              >
                <input type="hidden" name="title" value={t.title} /><button
                  class="chip-x"
                  aria-label={`${t.title} 옵션 제거`}
                  disabled={busy}>×</button
                >
              </form>{/if}</span
          >{/each}
      </div>
      <form
        method="POST"
        action={actionUrl("addTitle")}
        use:enhance={submit}
        class="term-free"
      >
        <input
          name="title"
          required
          maxlength="20"
          placeholder="새 직위 이름"
          value={actionState?.action === "addTitle" && actionState.error
            ? (actionState.values?.title ?? "")
            : ""}
          disabled={busy}
        /><button class="paper-btn small" disabled={busy}>직위 추가</button>
      </form>
    </details>
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
                <form
                  method="POST"
                  action={actionUrl("unassign")}
                  use:enhance={submit}
                >
                  <input type="hidden" name="memberId" value={a.memberId} />
                  <input type="hidden" name="term" value={term} />
                  <input type="hidden" name="title" value={title} />
                  <button
                    type="submit"
                    class="paper-btn small danger"
                    disabled={busy}>해제</button
                  >
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
      <p class="empty">학기와 직위를 선택하고 배정 대상을 조회하세요.</p>
    {:else if candidates.length === 0}
      <p class="empty">
        배정 가능한 회원이 없습니다 (운영 회원 DB 기준 — 재가입 승인된 회원만
        후보).
      </p>
    {:else}
      <ul class="candidates">
        {#each candidates as c (c.id)}
          <li>
            <span
              >{c.name} <small>{c.department}</small>{#if !c.registered}<small
                  class="unreg">{term} 미등록</small
                >{/if}</span
            >
            <form
              method="POST"
              action={actionUrl("assign")}
              use:enhance={submit}
            >
              <input type="hidden" name="memberId" value={c.id} />
              <input type="hidden" name="term" value={term} />
              <input type="hidden" name="title" value={selectedTitle} />
              <button type="submit" class="paper-btn small" disabled={busy}
                >배정</button
              >
            </form>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</article>

<style>
  .exec-paper {
    width: min(100%, 880px);
  }
  .scope-note {
    margin: 0 0 1rem;
    color: var(--latex-muted);
    font-size: 0.78rem;
    line-height: 1.7;
  }
  .notice {
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--latex-rule);
    font-size: 0.78rem;
  }
  .error {
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--color-danger-text, #b00);
    color: var(--color-danger-text, #b00);
    font-size: 0.78rem;
  }
  .picker {
    border: 1px solid var(--latex-rule);
    padding: 0.8rem;
    display: grid;
    gap: 0.7rem;
  }
  .selection-form {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr) auto;
    gap: 0.6rem;
    align-items: end;
  }
  .selection-form label {
    display: grid;
    gap: 0.3rem;
  }
  .title-options {
    border-top: 1px solid var(--latex-rule);
    padding-top: 0.7rem;
  }
  .title-options summary {
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .title-options .term-free {
    margin-top: 0.7rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    min-height: 2.5rem;
    text-decoration: none;
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--latex-rule);
    background: transparent;
    color: var(--latex-text);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    cursor: pointer;
  }
  .chip.active {
    background: var(--latex-text);
    color: var(--latex-bg);
  }
  .title-chip-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.1rem;
  }
  .title-chip-wrap form {
    margin: 0;
  }
  .chip-x {
    padding: 0.2rem 0.35rem;
    border: 0;
    background: transparent;
    color: var(--latex-muted);
    cursor: pointer;
    font-size: 0.8rem;
  }
  .chip-x:hover {
    color: var(--color-danger-text, #b00);
  }
  .term-free {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
  }
  .term-free input {
    width: 7rem;
    padding: 0.3rem 0.5rem;
    font-size: 0.72rem;
  }
  .board {
    margin-top: 1.1rem;
  }
  .board h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 600;
  }
  .group h3 {
    margin: 0.7rem 0 0.3rem;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--latex-accent);
  }
  .board ul {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--latex-rule);
  }
  .board li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--latex-rule);
    font-size: 0.8rem;
  }
  .board li:last-child {
    border-bottom: 0;
  }
  .board li form {
    margin: 0;
  }
  small {
    color: var(--latex-muted);
    margin-left: 0.35rem;
  }
  small.unreg {
    color: var(--latex-accent);
  }
  .candidates {
    max-height: 24rem;
    overflow-y: auto;
  }
  .empty {
    color: var(--latex-muted);
    font-size: 0.78rem;
  }
  .paper-btn.small {
    padding: 0.25rem 0.55rem;
    font-size: 0.62rem;
  }
  @media (max-width: 540px) {
    .selection-form {
      grid-template-columns: 1fr;
    }
  }
</style>
