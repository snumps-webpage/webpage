<script lang="ts">
  import { enhance } from "$app/forms";
  import type { SubmitFunction } from "@sveltejs/kit";
  import { tick, untrack } from "svelte";
  import AdminSectionNav from "$lib/components/admin/AdminSectionNav.svelte";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import {
    initialMailEditorDrafts,
    reconcileMailEditorDrafts,
    applyMailEditorResult,
    mailEditorNotice,
  } from "$lib/domain/admin-mail-editor";
  import type { AdminUtilityActionState } from "$lib/domain/admin-utility-state";
  import { MANUSCRIPT } from "$lib/constants";

  let { data, form } = $props();
  const events = $derived(data.events);
  const templates = $derived(data.templates);
  const variables = $derived(data.variables);
  const actionState = $derived(form as AdminUtilityActionState | null);
  const initial = untrack(() => ({
    drafts: initialMailEditorDrafts(data, actionState),
    state: actionState,
    templates: Object.fromEntries(
      data.templates.map((t) => [
        t.key,
        !!actionState?.error &&
          actionState.action === "save" &&
          actionState.targetKey === t.key,
      ]),
    ),
    variables: Object.fromEntries(
      data.variables.map((v) => [
        v.key,
        !!actionState?.error &&
          actionState.scope === "mail-variable" &&
          actionState.action === "saveVariable" &&
          actionState.targetKey === v.key,
      ]),
    ),
    rules: Object.fromEntries(
      data.events.map((e) => [
        e.event,
        !!actionState?.error &&
          actionState.action === "addRule" &&
          actionState.targetKey === e.event,
      ]),
    ),
  }));
  let drafts = $state(initial.drafts);
  let openTemplates = $state<Record<string, boolean>>(initial.templates);
  let openVariables = $state<Record<string, boolean>>(initial.variables);
  let openRules = $state<Record<string, boolean>>(initial.rules);
  let creatingTemplate = $state(
    untrack(
      () =>
        !!actionState?.error && actionState.scope === "mail-template-create",
    ),
  );
  let creatingVariable = $state(
    untrack(
      () =>
        !!actionState?.error && actionState.scope === "mail-variable-create",
    ),
  );
  let seen = initial.state;
  let pending = $state<symbol | null>(null);
  let transient = $state<{ tone: "error"; message: string } | null>(null);
  const busy = $derived(pending !== null);
  const notice = $derived(transient ?? mailEditorNotice(actionState));

  $effect(() => {
    const loaded = data;
    const state = actionState;
    untrack(() => {
      drafts = reconcileMailEditorDrafts(drafts, loaded);
      for (const t of loaded.templates)
        if (!Object.hasOwn(openTemplates, t.key)) openTemplates[t.key] = false;
      for (const v of loaded.variables)
        if (!Object.hasOwn(openVariables, v.key)) openVariables[v.key] = false;
      for (const e of loaded.events)
        if (!Object.hasOwn(openRules, e.event)) openRules[e.event] = false;
      if (state === seen) return;
      drafts = applyMailEditorResult(drafts, loaded, state);
      if (state?.error) {
        if (state.action === "save" && state.targetKey)
          openTemplates[state.targetKey] = true;
        if (
          state.action === "saveVariable" &&
          state.scope === "mail-variable" &&
          state.targetKey
        )
          openVariables[state.targetKey] = true;
        if (state.action === "addRule" && state.targetKey)
          openRules[state.targetKey] = true;
        if (state.scope === "mail-template-create") creatingTemplate = true;
        if (state.scope === "mail-variable-create") creatingVariable = true;
      } else if (state?.success) {
        if (state.action === "save" && state.targetKey)
          openTemplates[state.targetKey] = false;
        if (
          state.action === "saveVariable" &&
          state.scope === "mail-variable" &&
          state.targetKey
        )
          openVariables[state.targetKey] = false;
        if (state.action === "addRule" && state.targetKey)
          openRules[state.targetKey] = false;
        if (state.scope === "mail-template-create") creatingTemplate = false;
        if (state.scope === "mail-variable-create") creatingVariable = false;
      }
      seen = state;
    });
  });

  const submit: SubmitFunction = ({ cancel }) => {
    if (pending) {
      cancel();
      return;
    }
    const token = Symbol();
    pending = token;
    transient = null;
    return async ({ result, update }) => {
      try {
        if (pending !== token) return;
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
        transient = {
          tone: "error",
          message:
            "처리 후 상태를 확인하지 못했습니다. 새로고침해 확인해 주세요.",
        };
      } finally {
        if (pending === token) pending = null;
      }
      await tick();
      document.querySelector<HTMLElement>("[data-mail-result]")?.focus();
    };
  };
</script>

<svelte:head><title>자동 메일 관리 · SNUMPS Admin</title></svelte:head>

<article class="paper-document mail-paper">
  <ManuscriptHeader
    title="자동 메일 관리"
    subtitle="Automated Mail Rules & Templates"
    figure={MANUSCRIPT.FIGURES.ADMIN}
  />
  <AdminSectionNav />
  <p class="scope-note">
    <strong>발송 규칙</strong>은 "이벤트가 발생하면 → 어떤 템플릿을 → 누구에게"
    보낼지를 정합니다. 이벤트(발생 시점)와 수신자 종류는 시스템에 고정돼 있고,
    규칙과 문구는 여기서 자유롭게 추가·제거·수정할 수 있습니다. 수정할 때마다
    직전 버전 1개가 보관되어 "직전으로 되돌리기"로 복구할 수 있습니다. 커스텀
    템플릿을 만들어 기존 이벤트에 부착하면 코드 없이 새 자동 메일이 생깁니다.
    본문의 <code>{"{{변수}}"}</code>는 발송 시 실제 값으로 치환됩니다.
  </p>

  {#if notice}<p
      class:notice={notice.tone === "success"}
      class:error={notice.tone === "error"}
      data-mail-result
      tabindex="-1"
      role={notice.tone === "error" ? "alert" : "status"}
    >
      {notice.message}
    </p>{/if}
  <fieldset
    class="mail-controls"
    disabled={busy}
    aria-label="자동 메일 관리 입력"
    aria-busy={busy}
  >
    <h2 class="section-title">1. 발송 규칙 (이벤트별)</h2>
    <ul class="card-list">
      {#each events as ev (ev.event)}
        <li>
          <header>
            <div>
              <h3>{ev.name}</h3>
              <p class="description">
                {ev.description} · 변수: {#each ev.variables as v (v)}<code
                    >{"{{" + v + "}}"}</code
                  >{/each}
              </p>
            </div>
            <div class="badges">
              {#if ev.materialized}<span class="badge customized">수정됨</span
                >{:else}<span class="badge">기본값</span>{/if}
            </div>
          </header>

          <ul class="rule-list">
            {#each ev.rules as rule (rule.id ?? `${rule.templateKey}:${rule.recipient}`)}
              <li class:disabled={!rule.enabled}>
                <span class="rule-desc">
                  <strong>{rule.templateName}</strong> → {rule.recipientLabel}
                  {#if !rule.enabled}<span class="badge off">꺼짐</span>{/if}
                </span>
                <span class="rule-actions">
                  <form
                    method="POST"
                    action="?/toggleRule"
                    use:enhance={submit}
                  >
                    <input type="hidden" name="event" value={ev.event} />
                    <input type="hidden" name="ruleId" value={rule.id ?? ""} />
                    <input
                      type="hidden"
                      name="templateKey"
                      value={rule.templateKey}
                    />
                    <input
                      type="hidden"
                      name="recipient"
                      value={rule.recipient}
                    />
                    <input
                      type="hidden"
                      name="enabled"
                      value={rule.enabled ? "false" : "true"}
                    />
                    <button type="submit" class="paper-btn small"
                      >{rule.enabled ? "끄기" : "켜기"}</button
                    >
                  </form>
                  <form
                    method="POST"
                    action="?/removeRule"
                    use:enhance={submit}
                  >
                    <input type="hidden" name="event" value={ev.event} />
                    <input type="hidden" name="ruleId" value={rule.id ?? ""} />
                    <input
                      type="hidden"
                      name="templateKey"
                      value={rule.templateKey}
                    />
                    <input
                      type="hidden"
                      name="recipient"
                      value={rule.recipient}
                    />
                    <button type="submit" class="paper-btn small danger"
                      >제거</button
                    >
                  </form>
                </span>
              </li>
            {:else}
              <li class="empty-rule">
                발송 규칙 없음 — 이 이벤트에서는 메일이 나가지 않습니다.
              </li>
            {/each}
          </ul>

          <div class="row-actions">
            <details class="editor-disclosure" bind:open={openRules[ev.event]}>
              <summary>규칙 추가</summary>
              <form
                method="POST"
                action="?/addRule"
                class="add-rule"
                use:enhance={submit}
              >
                <input type="hidden" name="event" value={ev.event} />
                <label
                  ><span class="paper-label">템플릿</span><select
                    name="templateKey"
                    bind:value={drafts.rules[ev.event].templateKey}
                    required
                    >{#each templates as t (t.key)}<option value={t.key}
                        >{t.name}</option
                      >{/each}</select
                  ></label
                >
                <label
                  ><span class="paper-label">수신자</span><select
                    name="recipient"
                    bind:value={drafts.rules[ev.event].recipient}
                    required
                    >{#each ev.allowedRecipients as r (r.key)}<option
                        value={r.key}>{r.label}</option
                      >{/each}</select
                  ></label
                >
                <button class="paper-btn primary">규칙 추가</button>
              </form>
            </details>
            {#if ev.canRevert}<form
                method="POST"
                action="?/revertEvent"
                use:enhance={submit}
              >
                <input type="hidden" name="event" value={ev.event} /><button
                  class="paper-btn">직전 규칙으로 되돌리기</button
                >
              </form>{/if}
          </div>
        </li>
      {/each}
    </ul>

    <h2 class="section-title">2. 템플릿 (문구)</h2>
    <details
      class="editor-disclosure section-actions"
      bind:open={creatingTemplate}
    >
      <summary>커스텀 템플릿 만들기</summary>
      <form
        method="POST"
        action="?/createTemplate"
        class="create-form"
        use:enhance={submit}
      >
        <label
          ><span class="paper-label">이름</span><input
            name="name"
            bind:value={drafts.createTemplate.name}
            required
            placeholder="예: 세미나 리마인더"
          /></label
        >
        <label
          ><span class="paper-label">제목</span><input
            name="subject"
            bind:value={drafts.createTemplate.subject}
            required
          /></label
        >
        <label
          ><span class="paper-label">본문</span><textarea
            name="body"
            bind:value={drafts.createTemplate.body}
            rows="6"
            required></textarea></label
        >
        <button class="paper-btn primary">만들기</button>
      </form>
    </details>

    <ul class="card-list">
      {#each templates as t (t.key)}
        <li class:disabled={!t.enabled}>
          <header>
            <div>
              <h3>{t.name}</h3>
              <p class="description">{t.description}</p>
            </div>
            <div class="badges">
              {#if t.isCustom}<span class="badge customized">커스텀</span
                >{:else if t.customized}<span class="badge customized"
                  >수정됨</span
                >{:else}<span class="badge">기본값</span>{/if}
              {#if !t.enabled}<span class="badge off">발송 꺼짐</span>{/if}
            </div>
          </header>

          <details class="editor-disclosure" bind:open={openTemplates[t.key]}>
            <summary>문구 편집</summary>
            <form method="POST" action="?/save" use:enhance={submit}>
              <input type="hidden" name="key" value={t.key} />
              <label>
                <span class="paper-label">제목</span>
                <input
                  type="text"
                  name="subject"
                  bind:value={drafts.templates[t.key].subject}
                  required
                />
              </label>
              <label>
                <span class="paper-label">본문</span>
                <textarea
                  name="body"
                  rows="10"
                  bind:value={drafts.templates[t.key].body}
                  required></textarea>
              </label>
              {#if t.variables.length}
                <p class="variables">
                  사용 가능한 변수: {#each t.variables as v (v)}<code
                      >{"{{" + v + "}}"}</code
                    >{/each}
                </p>
              {/if}
              <label class="enabled-toggle">
                <input
                  type="checkbox"
                  name="enabled"
                  bind:checked={drafts.templates[t.key].enabled}
                /> 발송 활성화
              </label>
              <div class="row-actions">
                <button type="submit" class="paper-btn primary">저장</button>
                <button
                  type="button"
                  class="paper-btn"
                  onclick={() => (openTemplates[t.key] = false)}>닫기</button
                >
              </div>
            </form>
          </details>
          <p class="subject-preview">
            <span class="paper-label">제목</span>
            {t.subject}
          </p>
          <div class="row-actions">
            <form method="POST" action="?/toggle" use:enhance={submit}>
              <input type="hidden" name="key" value={t.key} />
              <input
                type="hidden"
                name="enabled"
                value={t.enabled ? "false" : "true"}
              />
              <button type="submit" class="paper-btn"
                >{t.enabled ? "발송 끄기" : "발송 켜기"}</button
              >
            </form>
            {#if t.canRevert}
              <form
                method="POST"
                action="?/revertTemplate"
                use:enhance={submit}
              >
                <input type="hidden" name="key" value={t.key} />
                <button type="submit" class="paper-btn"
                  >직전으로 되돌리기</button
                >
              </form>
            {/if}
            {#if t.isCustom}
              <form
                method="POST"
                action="?/deleteTemplate"
                use:enhance={submit}
              >
                <input type="hidden" name="key" value={t.key} />
                <button type="submit" class="paper-btn danger">삭제</button>
              </form>
            {/if}
          </div>
        </li>
      {/each}
    </ul>

    <h2 class="section-title">3. 공용 변수</h2>
    <p class="scope-note">
      모든 템플릿에서 <code>{"{{변수}}"}</code>로 쓸 수 있는 고정 값입니다 (카톡
      링크 등). 이벤트가 발송 시점에 공급하는 변수(<code>{"{{name}}"}</code> 등)와
      이름이 겹치면 이벤트 값이 우선합니다.
    </p>
    <details
      class="editor-disclosure section-actions"
      bind:open={creatingVariable}
    >
      <summary>공용 변수 추가</summary>
      <form
        method="POST"
        action="?/saveVariable"
        class="create-form"
        use:enhance={submit}
      >
        <input type="hidden" name="editor" value="create" />
        <label
          ><span class="paper-label">변수 이름 (영문)</span><input
            name="key"
            bind:value={drafts.createVariable.key}
            required
            pattern="[a-zA-Z][a-zA-Z0-9]*"
            placeholder="예: clubRoomLocation"
          /></label
        >
        <label
          ><span class="paper-label">값</span><input
            name="value"
            bind:value={drafts.createVariable.value}
            required
          /></label
        >
        <label
          ><span class="paper-label">설명</span><input
            name="description"
            bind:value={drafts.createVariable.description}
            placeholder="어디에 쓰는 값인지"
          /></label
        >
        <button class="paper-btn primary">변수 추가</button>
      </form>
    </details>

    <ul class="card-list">
      {#each variables as v (v.key)}
        <li>
          <header>
            <div>
              <h3><code>{"{{" + v.key + "}}"}</code></h3>
              <p class="description">{v.description || "설명 없음"}</p>
            </div>
            <div class="badges">
              {#if v.isCustom}<span class="badge customized">커스텀</span
                >{:else if v.customized}<span class="badge customized"
                  >수정됨</span
                >{:else}<span class="badge">기본값</span>{/if}
            </div>
          </header>
          <details class="editor-disclosure" bind:open={openVariables[v.key]}>
            <summary>변수 편집</summary>
            <form method="POST" action="?/saveVariable" use:enhance={submit}>
              <input type="hidden" name="key" value={v.key} />
              <label
                ><span class="paper-label">값</span><input
                  type="text"
                  name="value"
                  bind:value={drafts.variables[v.key].value}
                  required
                /></label
              >
              <label
                ><span class="paper-label">설명</span><input
                  type="text"
                  name="description"
                  bind:value={drafts.variables[v.key].description}
                /></label
              >
              <div class="row-actions">
                <button type="submit" class="paper-btn primary">저장</button>
                <button
                  type="button"
                  class="paper-btn"
                  onclick={() => (openVariables[v.key] = false)}>닫기</button
                >
              </div>
            </form>
          </details>
          <p class="subject-preview">
            <span class="paper-label">값</span>
            {v.value}
          </p>
          <div class="row-actions">
            {#if v.canRevert}
              <form
                method="POST"
                action="?/revertVariable"
                use:enhance={submit}
              >
                <input type="hidden" name="key" value={v.key} />
                <button type="submit" class="paper-btn"
                  >직전으로 되돌리기</button
                >
              </form>
            {/if}
            {#if v.isCustom}
              <form
                method="POST"
                action="?/deleteVariable"
                use:enhance={submit}
              >
                <input type="hidden" name="key" value={v.key} />
                <button type="submit" class="paper-btn danger">삭제</button>
              </form>
            {/if}
          </div>
        </li>
      {/each}
    </ul>

    <h2 class="section-title">4. 발송 테스트</h2>
    <p class="scope-note">
      실제 메일을 지정 주소로 1회 발송해 문구와 변수 치환을 확인합니다. 변수는 <code
        >[예시 변수명]</code
      >으로 채워지고 제목에 <strong>[테스트]</strong>가 붙습니다.
      <strong>이벤트 테스트</strong>는 그 이벤트의 켜진 규칙 전부를 — 실제
      수신자 대신 — 입력한 주소로만 보냅니다 (회원·관리자에게 나가지 않음).
    </p>
    <div class="test-board">
      <section>
        <h3>템플릿 하나 테스트</h3>
        <form
          method="POST"
          action="?/testTemplate"
          class="add-rule"
          use:enhance={submit}
        >
          <label
            ><span class="paper-label">받는 주소</span><input
              type="email"
              name="to"
              bind:value={drafts.testTemplate.to}
              required
              placeholder="me@snu.ac.kr"
            /></label
          >
          <label
            ><span class="paper-label">템플릿</span><select
              name="templateKey"
              bind:value={drafts.testTemplate.templateKey}
              required
              >{#each templates as t (t.key)}<option value={t.key}
                  >{t.name}</option
                >{/each}</select
            ></label
          >
          <button class="paper-btn primary">이 주소로 템플릿 테스트 발송</button
          >
        </form>
      </section>
      <section>
        <h3>이벤트의 켜진 규칙 테스트</h3>
        <form
          method="POST"
          action="?/testEvent"
          class="add-rule"
          use:enhance={submit}
        >
          <label
            ><span class="paper-label">받는 주소</span><input
              type="email"
              name="to"
              bind:value={drafts.testEvent.to}
              required
              placeholder="me@snu.ac.kr"
            /></label
          >
          <label
            ><span class="paper-label">이벤트</span><select
              name="event"
              bind:value={drafts.testEvent.event}
              required
              >{#each events as ev (ev.event)}<option value={ev.event}
                  >{ev.name}</option
                >{/each}</select
            ></label
          >
          <button class="paper-btn primary"
            >이 주소로 켜진 규칙 테스트 발송</button
          >
        </form>
      </section>
    </div>
  </fieldset>
</article>

<style>
  .mail-paper {
    width: min(100%, 920px);
  }
  .scope-note {
    margin: 0 0 1rem;
    color: var(--latex-muted);
    font-size: 0.78rem;
    line-height: 1.7;
  }
  .section-title {
    margin: 1.4rem 0 0.7rem;
    font-size: 1.05rem;
    font-weight: 600;
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
  .card-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.8rem;
  }
  .card-list > li {
    padding: 0.9rem;
    border: 1px solid var(--latex-rule);
  }
  .card-list > li.disabled {
    opacity: 0.65;
  }
  .card-list > li > header {
    display: flex;
    justify-content: space-between;
    gap: 0.8rem;
    align-items: start;
  }
  h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .description {
    margin: 0.2rem 0 0;
    color: var(--latex-muted);
    font-size: 0.72rem;
  }
  .description code {
    margin-left: 0.25rem;
    font-size: 0.95em;
  }
  .badges {
    display: flex;
    gap: 0.35rem;
    flex-shrink: 0;
  }
  .badge {
    padding: 0.15rem 0.45rem;
    border: 1px solid var(--latex-rule);
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.55rem;
    text-transform: uppercase;
  }
  .badge.customized {
    border-color: var(--latex-accent);
    color: var(--latex-accent);
  }
  .badge.off {
    background: var(--latex-text);
    border-color: var(--latex-text);
    color: var(--latex-bg);
  }
  .rule-list {
    margin: 0.6rem 0 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--latex-rule);
  }
  .rule-list > li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--latex-rule);
    font-size: 0.78rem;
  }
  .rule-list > li:last-child {
    border-bottom: 0;
  }
  .rule-list > li.disabled .rule-desc {
    opacity: 0.55;
  }
  .rule-list > li.empty-rule {
    color: var(--latex-muted);
    font-size: 0.72rem;
  }
  .rule-desc .badge {
    margin-left: 0.4rem;
  }
  .rule-actions {
    display: flex;
    gap: 0.35rem;
    flex-shrink: 0;
  }
  .rule-actions form {
    margin: 0;
  }
  .subject-preview {
    margin: 0.6rem 0 0;
    font-size: 0.8rem;
  }
  .subject-preview .paper-label {
    margin-right: 0.4rem;
  }
  form label {
    display: block;
    margin-top: 0.7rem;
  }
  input[type="text"],
  textarea,
  select {
    width: 100%;
    margin-top: 0.25rem;
    padding: 0.5rem 0.6rem;
    font-size: 0.8rem;
  }
  textarea {
    font-family: inherit;
    line-height: 1.65;
    resize: vertical;
  }
  .variables {
    margin: 0.5rem 0 0;
    color: var(--latex-muted);
    font-size: 0.68rem;
  }
  .variables code {
    margin-right: 0.35rem;
    font-size: 0.9em;
  }
  .enabled-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.6rem;
    font-size: 0.78rem;
  }
  .row-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.7rem;
    flex-wrap: wrap;
    align-items: end;
  }
  .row-actions form {
    margin: 0;
  }
  .section-actions {
    margin-bottom: 0.8rem;
  }
  .add-rule {
    display: flex;
    gap: 0.6rem;
    align-items: end;
    flex-wrap: wrap;
    width: 100%;
  }
  .add-rule label {
    flex: 1 1 14rem;
    margin-top: 0;
  }
  .create-form {
    width: 100%;
    border: 1px solid var(--latex-rule);
    padding: 0.8rem;
  }
  .create-form label:first-child {
    margin-top: 0;
  }
  .paper-btn.small {
    padding: 0.25rem 0.55rem;
    font-size: 0.62rem;
  }
  .test-board {
    border: 1px solid var(--latex-rule);
    padding: 0.9rem;
  }
  .mail-controls {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  .editor-disclosure {
    width: 100%;
    border-top: 1px solid var(--latex-rule);
    padding-top: 0.65rem;
  }
  .editor-disclosure summary {
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .test-board {
    display: grid;
    gap: 1rem;
  }
  .test-board h3 {
    font-size: 0.9rem;
    margin: 0 0 0.5rem;
  }
</style>
