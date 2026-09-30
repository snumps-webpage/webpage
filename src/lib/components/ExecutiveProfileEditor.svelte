<script lang="ts">
  import { enhance } from "$app/forms";
  import { untrack } from "svelte";
  import {
    cohortLabel,
    LINKABLE_FIELDS,
    PROFILE_FIELD_LABELS,
    PROFILE_FIELDS,
    type ExecutiveProfileFormFailure,
    type ExecutiveProfileSettings,
    type ProfileFieldKey,
  } from "$lib/domain/executive-profile";

  /**
   * 역대 회장단 공개 프로필 편집기 — 본인 설정과 관리자 대리 편집이 같이 쓴다.
   * 필드마다 비공개 / 회원 정보 사용(연동) / 직접 입력. 부모는 대상이나 저장된
   * 설정이 바뀌면 {#key}로 다시 만든다; 검증 실패 때는 입력한 값이 그대로 남는다.
   */
  interface Props {
    settings: ExecutiveProfileSettings;
    linked: {
      department: string | null;
      cohort: string | null;
      email: string | null;
    };
    /** 관리자 편집일 때만 — 누구의 프로필인지 폼에 싣는다. */
    memberId?: string | null;
    failure?: ExecutiveProfileFormFailure | null;
  }
  let { settings, linked, memberId = null, failure = null }: Props = $props();

  type Draft = Record<ProfileFieldKey, { source: string; value: string }>;
  let draft = $state<Draft>(
    untrack(
      () =>
        Object.fromEntries(
          PROFILE_FIELDS.map((field) => {
            const s = settings[field];
            return [
              field,
              {
                source: s.source,
                value: s.source === "custom" ? s.value : "",
              },
            ];
          }),
        ) as Draft,
    ),
  );
  let saving = $state(false);

  function linkedText(field: ProfileFieldKey): string | null {
    switch (field) {
      case "department":
        return linked.department;
      case "cohort":
        return linked.cohort ? cohortLabel(linked.cohort) : null;
      case "email":
        return linked.email;
      default:
        return null; // 근황은 연동 원천이 없다
    }
  }

  /** 지금 고른 대로면 공개 카드에 무엇이 나가는지. */
  function shown(field: ProfileFieldKey): string | null {
    const { source, value } = draft[field];
    if (source === "member") return linkedText(field);
    if (source !== "custom" || !value.trim()) return null;
    return field === "cohort" ? cohortLabel(value.trim()) : value.trim();
  }
  const preview = $derived({
    line: [shown("department"), shown("cohort")].filter(Boolean).join(" · "),
    email: shown("email"),
    bio: shown("bio"),
  });

  const INPUT_HINT: Record<ProfileFieldKey, string> = {
    department: "예: 수리과학부",
    cohort: "입학년도 두 자리 (예: 18)",
    email: "공개할 이메일",
    bio: "근황 (200자 이내)",
  };
</script>

<form
  class="profile-editor"
  method="POST"
  action="?/save"
  use:enhance={() => {
    saving = true;
    return async ({ update }) => {
      await update({ reset: false });
      saving = false;
    };
  }}
>
  {#if memberId}<input type="hidden" name="memberId" value={memberId} />{/if}

  {#each PROFILE_FIELDS as field (field)}
    {@const issue = failure?.issues[field]}
    <fieldset class="profile-field" class:invalid={!!issue}>
      <legend>{PROFILE_FIELD_LABELS[field]}</legend>
      <div class="source-options">
        <label>
          <input
            type="radio"
            name={`${field}.source`}
            value="hidden"
            bind:group={draft[field].source}
          />
          비공개
        </label>
        {#if LINKABLE_FIELDS[field]}
          <label>
            <input
              type="radio"
              name={`${field}.source`}
              value="member"
              bind:group={draft[field].source}
            />
            회원 정보 사용
            <span class="linked-value" class:missing={!linkedText(field)}>
              {linkedText(field) ?? "회원 정보에 없음"}
            </span>
          </label>
        {/if}
        <label>
          <input
            type="radio"
            name={`${field}.source`}
            value="custom"
            bind:group={draft[field].source}
          />
          직접 입력
        </label>
      </div>

      {#if draft[field].source === "custom"}
        {#if field === "bio"}
          <textarea
            name="bio.value"
            rows="3"
            maxlength="200"
            placeholder={INPUT_HINT.bio}
            aria-label="근황"
            bind:value={draft.bio.value}></textarea>
          <span class="counter">{draft.bio.value.length}/200</span>
        {:else}
          <input
            name={`${field}.value`}
            type={field === "email" ? "email" : "text"}
            inputmode={field === "cohort" ? "numeric" : undefined}
            maxlength={field === "cohort" ? 2 : field === "email" ? 100 : 40}
            placeholder={INPUT_HINT[field]}
            aria-label={PROFILE_FIELD_LABELS[field]}
            bind:value={draft[field].value}
          />
        {/if}
      {/if}
      {#if issue}<p class="field-error" role="alert">{issue}</p>{/if}
    </fieldset>
  {/each}

  <section class="preview" aria-label="공개 미리보기">
    <p class="preview-label">공개 미리보기</p>
    {#if preview.line || preview.email || preview.bio}
      {#if preview.line}<p>{preview.line}</p>{/if}
      {#if preview.email}<p class="mono">{preview.email}</p>{/if}
      {#if preview.bio}<p class="bio">{preview.bio}</p>{/if}
    {:else}
      <p class="muted">이름과 직위만 공개됩니다.</p>
    {/if}
  </section>

  <div class="actions">
    <button class="paper-btn" disabled={saving}>
      {saving ? "저장 중…" : "저장"}
    </button>
  </div>
</form>

<style>
  .profile-editor {
    display: grid;
    gap: 0.7rem;
  }
  .profile-field {
    display: grid;
    gap: 0.55rem;
    margin: 0;
    padding: 0.8rem 0.9rem;
    border: 1px solid var(--latex-rule);
  }
  .profile-field.invalid {
    border-color: var(--color-danger-text);
  }
  legend {
    padding: 0 0.3rem;
    color: var(--latex-accent);
    font: 700 0.62rem/1 var(--font-mono);
    letter-spacing: 0.08em;
  }
  .source-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.1rem;
    font-size: 0.8rem;
  }
  .source-options label {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .linked-value {
    color: var(--latex-muted);
    font: 0.7rem/1.2 var(--font-mono);
    overflow-wrap: anywhere;
  }
  .linked-value.missing {
    font-style: italic;
  }
  input:not([type="radio"]),
  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--latex-rule);
    background: transparent;
    color: var(--latex-text);
    font: inherit;
    font-size: 0.82rem;
  }
  textarea {
    resize: vertical;
    line-height: 1.6;
  }
  .counter {
    justify-self: end;
    color: var(--latex-muted);
    font: 0.62rem/1 var(--font-mono);
  }
  .field-error {
    margin: 0;
    color: var(--color-danger-text);
    font-size: 0.74rem;
  }
  .preview {
    padding: 0.75rem 0.9rem;
    border: 1px dashed var(--latex-rule);
    font-size: 0.8rem;
  }
  .preview p {
    margin: 0.2rem 0 0;
  }
  .preview .preview-label {
    margin: 0 0 0.35rem;
    color: var(--latex-muted);
    font: 700 0.58rem/1 var(--font-mono);
    letter-spacing: 0.08em;
  }
  .preview .mono {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    overflow-wrap: anywhere;
  }
  .preview .bio {
    white-space: pre-line;
    color: var(--latex-muted);
  }
  .preview .muted {
    color: var(--latex-muted);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
  @media (max-width: 500px) {
    .source-options {
      flex-direction: column;
    }
    .actions :global(.paper-btn) {
      width: 100%;
    }
  }
</style>
