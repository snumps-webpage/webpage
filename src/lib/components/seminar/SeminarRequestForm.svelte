<script lang="ts">
  import { enhance } from "$app/forms";
  import { actionErrorText } from "$lib/domain/api";
  import { tick, untrack } from "svelte";
  import SeminarPosterSection from "$lib/components/poster/SeminarPosterSection.svelte";
  import SpeakerSelector from "$lib/components/poster/SpeakerSelector.svelte";
  import { invalidateAll } from "$app/navigation";
  import {
    initialSeminarPresenters,
    type SeminarProposalActionState,
  } from "$lib/domain/seminar-proposal";
  import type {
    MemberPickerItem,
    SeminarFormIssues,
    SeminarKind,
    SeminarRequestField,
    SeminarRequestFormValues,
  } from "$lib/domain/seminars";

  interface Props {
    mode: "create" | "edit";
    members: MemberPickerItem[];
    memberDirectoryUnavailable?: boolean;
    initialValues?: Partial<SeminarRequestFormValues>;
    initialPresenters?: MemberPickerItem[];
    /** 현재 학기 활동월 선택지 (서버 계산 — 방학 제외) */
    timingOptions?: string[];
    canSubmit?: boolean;
    form?: SeminarProposalActionState | null;
  }

  let {
    mode,
    members,
    memberDirectoryUnavailable = false,
    initialValues = {},
    initialPresenters = [],
    timingOptions = [],
    canSubmit = true,
    form = null,
  }: Props = $props();

  const { startingValues, startingPresenters } = untrack(() => {
    const submittedValues =
      form?.operation === "requestWithdrawn" ? {} : (form?.values ?? {});
    const values = { ...initialValues, ...submittedValues };

    return {
      startingValues: values,
      startingPresenters: initialSeminarPresenters(
        members,
        values.presenterIds,
        initialPresenters,
      ),
    };
  });

  let kind = $state<SeminarKind | "">(startingValues.kind ?? "");
  let title = $state(startingValues.title ?? "");
  let description = $state(startingValues.description ?? "");
  let prerequisites = $state(startingValues.prerequisites ?? "");
  let duration = $state(startingValues.duration ?? "");
  let preferredTiming = $state(startingValues.preferredTiming ?? "");
  let attachmentUrl = $state(startingValues.attachmentUrl ?? "");
  let selectedPresenters = $state<MemberPickerItem[]>(startingPresenters);
  const currentPresenters = $derived(
    selectedPresenters.map(
      (presenter) =>
        members.find((member) => member.id === presenter.id) ?? presenter,
    ),
  );
  let showSearch = $state(false);
  let processing = $state(false);
  let refreshingDirectory = $state(false);
  let refreshError = $state<string | null>(null);
  const proposalResult = $derived(
    form?.operation === "requestWithdrawn" ? null : form,
  );
  let formElement = $state<HTMLFormElement>();

  let clearedIssueFields = $state<SeminarRequestField[]>([]);
  let issues = $derived(
    Object.fromEntries(
      Object.entries(proposalResult?.issues ?? {}).filter(
        ([field]) => !clearedIssueFields.includes(field as SeminarRequestField),
      ),
    ) as SeminarFormIssues,
  );

  function clearIssue(field: keyof SeminarFormIssues) {
    if (!issues[field] || clearedIssueFields.includes(field)) return;
    clearedIssueFields = [...clearedIssueFields, field];
  }

  function actionErrorMessage(code: string | undefined) {
    if (proposalResult?.message) return proposalResult.message;
    switch (code) {
      case undefined:
        return null;
      case "VALIDATION_FAILED":
        return Object.keys(proposalResult?.issues ?? {}).length > 0
          ? null
          : actionErrorText(proposalResult, "입력값을 확인해 주세요.");
      case "NOT_FOUND":
        return "신청을 찾을 수 없습니다.";
      case "FORBIDDEN":
        return "이 신청을 수정할 권한이 없습니다.";
      case "CONFLICT":
        return "신청 상태가 이미 변경되었습니다. 페이지를 새로고침해 주세요.";
      case "WRITE_CONFLICT":
        return "동시에 다른 변경이 저장되었습니다. 다시 시도해 주세요.";
      default:
        return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
  }

  let formError = $derived(
    issues._form ?? actionErrorMessage(proposalResult?.error),
  );

  const isEdit = untrack(() => mode === "edit");
  const submitLabel = isEdit ? "수정 사항 저장" : "개설 신청 제출";
  async function refreshDirectory() {
    if (refreshingDirectory) return;
    refreshingDirectory = true;
    refreshError = null;
    try {
      await invalidateAll();
    } catch {
      refreshError =
        "회원 목록을 다시 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    } finally {
      refreshingDirectory = false;
    }
  }
</script>

{#if proposalResult?.success}
  <section
    class="proposal-receipt"
    role="status"
    aria-labelledby="seminar-receipt-heading"
  >
    <p class="receipt-label">
      {isEdit ? "수정 저장 완료" : "접수 완료 · 검토 중"}
    </p>
    <h2 id="seminar-receipt-heading">
      {isEdit ? "신청 내용을 저장했습니다" : "신청을 접수했습니다"}
    </h2>
    <p>
      {isEdit
        ? "저장한 원고를 기준으로 운영진 검토가 이어집니다."
        : "운영진이 주제와 발표자를 검토합니다. 승인 후 일정을 조율하며, 공개 전에는 확정 일정이 아닙니다."}
    </p>
    <div class="paper-actions">
      <a href="/#my-seminars-heading" class="paper-btn primary"
        >내 세미나 진행 확인</a
      >{#if !isEdit}<a
          href="/seminar/apply"
          data-sveltekit-reload
          class="paper-btn">새 신청서 작성</a
        >{/if}
    </div>
  </section>
{:else}
  <form
    bind:this={formElement}
    class="seminar-proposal-form"
    aria-busy={processing}
    method="POST"
    action={isEdit ? "?/update" : undefined}
    use:enhance={({ cancel }) => {
      if (processing || !canSubmit || memberDirectoryUnavailable) {
        cancel();
        return;
      }
      clearedIssueFields = [];
      processing = true;
      return async ({ update }) => {
        try {
          await update({ reset: false });
        } finally {
          processing = false;
        }
        await tick();
        if (issues.presenterIds) {
          showSearch = true;
          await tick();
        }
        formElement
          ?.querySelector<HTMLElement>(
            '.kind-fieldset.invalid input, input[aria-invalid="true"], textarea[aria-invalid="true"], [role="alert"]',
          )
          ?.focus();
      };
    }}
  >
    {#if formError}
      <p class="paper-status-note error" role="alert" tabindex="-1">
        {formError}
      </p>
    {/if}

    {#if !canSubmit}<p class="directory-notice">
        현재 계정은 열람만 가능합니다. 이번 학기 등록 회원만 신청을 제출하거나
        수정할 수 있습니다.
      </p>{/if}
    {#if memberDirectoryUnavailable}
      <div class="directory-notice" role="status">
        <p>
          회원 목록을 불러오지 못해 발표자를 확인할 수 없습니다. 원고를 유지한
          채 목록을 다시 불러올 수 있습니다.
        </p>
        <button
          type="button"
          class="paper-btn"
          disabled={refreshingDirectory}
          onclick={refreshDirectory}
          >{refreshingDirectory
            ? "회원 목록 읽는 중…"
            : "회원 목록 다시 불러오기"}</button
        >
      </div>
    {/if}
    {#if refreshError}<p class="paper-status-note error" role="alert">
        {refreshError}
      </p>{/if}
    <fieldset class="proposal-inputs" disabled={processing || !canSubmit}>
      <legend class="sr-only">세미나 개설 내용</legend>
      <ol class="paper-sections">
        <li class="paper-section">
          <div class="section-heading">
            <div>
              <p class="section-index">01 · 운영 방식</p>
              <h2 class="paper-section-title">운영 방식</h2>
            </div>
            <p class="section-note">신청 한 건은 발표 한 건을 의미합니다.</p>
          </div>

          <fieldset
            class="kind-fieldset"
            aria-describedby={issues.kind ? "kind-error" : "kind-hint"}
            class:invalid={!!issues.kind}
          >
            <legend class="paper-label"
              >세미나 구분 <span class="req">*</span></legend
            >
            <div class="kind-grid">
              <label class="kind-option" class:selected={kind === "regular"}>
                <input
                  type="radio"
                  name="kind"
                  value="regular"
                  bind:group={kind}
                  onchange={() => clearIssue("kind")}
                />

                <span class="kind-copy">
                  <strong>정기 세미나</strong>
                  <small>학기 초 모집 후 운영진이 정기 슬롯에 배치합니다.</small
                  >
                </span>
              </label>
              <label class="kind-option" class:selected={kind === "irregular"}>
                <input
                  type="radio"
                  name="kind"
                  value="irregular"
                  bind:group={kind}
                  onchange={() => clearIssue("kind")}
                />

                <span class="kind-copy">
                  <strong>비정기 세미나</strong>
                  <small
                    >주제를 먼저 승인하고 발표자와 일정을 따로 조율합니다.</small
                  >
                </span>
              </label>
            </div>
            {#if issues.kind}
              <p class="field-error" id="kind-error">{issues.kind}</p>
            {:else}
              <p class="paper-hint" id="kind-hint">
                신청 단계에서는 날짜를 입력하지 않습니다.
              </p>
            {/if}
          </fieldset>
        </li>

        <li class="paper-section">
          <div class="section-heading">
            <div>
              <p class="section-index">02 · 발표 내용</p>
              <h2 class="paper-section-title">세미나 원고</h2>
            </div>
          </div>

          <div class="paper-field">
            <label for="title" class="paper-label"
              >세미나 주제 <span class="req">*</span></label
            >
            <input
              type="text"
              id="title"
              name="title"
              bind:value={title}
              oninput={() => clearIssue("title")}
              maxlength="120"
              aria-invalid={!!issues.title}
              aria-describedby={issues.title ? "title-error" : undefined}
              placeholder="예: 대수위상수학의 기본군과 피복공간"
            />
            {#if issues.title}<p class="field-error" id="title-error">
                {issues.title}
              </p>{/if}
          </div>

          <div class="paper-field">
            <label for="description" class="paper-label"
              >세미나 설명 <span class="req">*</span></label
            >
            <textarea
              id="description"
              name="description"
              bind:value={description}
              oninput={() => clearIssue("description")}
              rows="5"
              maxlength="4000"
              aria-invalid={!!issues.description}
              aria-describedby={issues.description
                ? "description-error"
                : undefined}
              placeholder="다룰 내용과 세미나의 목적을 적어 주세요."></textarea>
            {#if issues.description}<p
                class="field-error"
                id="description-error"
              >
                {issues.description}
              </p>{/if}
          </div>

          <div class="paper-field">
            <label for="prerequisites" class="paper-label">선수 지식</label>
            <textarea
              id="prerequisites"
              name="prerequisites"
              bind:value={prerequisites}
              oninput={() => clearIssue("prerequisites")}
              rows="3"
              maxlength="2000"
              aria-invalid={!!issues.prerequisites}
              aria-describedby={issues.prerequisites
                ? "prerequisites-error"
                : undefined}
              placeholder="필요한 배경 지식이 없다면 비워 두어도 됩니다."
            ></textarea>
            {#if issues.prerequisites}<p
                class="field-error"
                id="prerequisites-error"
              >
                {issues.prerequisites}
              </p>{/if}
          </div>
        </li>

        <li class="paper-section">
          <div class="section-heading">
            <div>
              <p class="section-index">03 · 진행 정보</p>
              <h2 class="paper-section-title">진행 정보</h2>
            </div>
          </div>

          <div class="paper-field">
            <label for="duration" class="paper-label"
              >예상 소요 시간 <span class="req">*</span></label
            >
            <input
              type="text"
              id="duration"
              name="duration"
              bind:value={duration}
              oninput={() => clearIssue("duration")}
              maxlength="80"
              aria-invalid={!!issues.duration}
              aria-describedby={issues.duration
                ? "duration-error"
                : "duration-hint"}
              placeholder="예: 90분"
            />
            {#if issues.duration}
              <p class="field-error" id="duration-error">{issues.duration}</p>
            {:else}
              <p class="paper-hint" id="duration-hint">
                날짜·시간·장소는 승인 후 운영진과 조율합니다.
              </p>
            {/if}
          </div>

          <div class="paper-field">
            <label for="preferredTiming" class="paper-label"
              >선호 세미나 시점</label
            >
            <select
              id="preferredTiming"
              name="preferredTiming"
              bind:value={preferredTiming}
            >
              <option value="">선택 안 함</option>
              {#each timingOptions as opt (opt)}
                <option value={opt}>{opt}</option>
              {/each}
            </select>
            <p class="paper-hint">
              대략적인 선호 시점입니다. 구체 일정은 승인 후 조율합니다.
            </p>
          </div>

          <div class="paper-field">
            <label for="attachmentUrl" class="paper-label">외부 첨부 URL</label>
            <input
              type="url"
              id="attachmentUrl"
              name="attachment"
              bind:value={attachmentUrl}
              oninput={() => clearIssue("attachmentUrl")}
              maxlength="2048"
              inputmode="url"
              aria-invalid={!!issues.attachmentUrl}
              aria-describedby={issues.attachmentUrl
                ? "attachment-error"
                : "attachment-hint"}
              placeholder="https://drive.google.com/..."
            />
            {#if issues.attachmentUrl}
              <p class="field-error" id="attachment-error">
                {issues.attachmentUrl}
              </p>
            {:else}
              <p class="paper-hint" id="attachment-hint">
                강의 자료나 계획서가 있다면 HTTPS 링크를 입력해 주세요.
              </p>
            {/if}
          </div>
        </li>

        <li class="paper-section">
          <div class="section-heading">
            <div>
              <p class="section-index">04 · 발표자</p>
              <h2 class="paper-section-title">발표자</h2>
            </div>
          </div>
          <SpeakerSelector
            bind:selectedSpeakers={selectedPresenters}
            {members}
            {memberDirectoryUnavailable}
            bind:showSearch
            error={issues.presenterIds}
            onChange={() => clearIssue("presenterIds")}
          />
        </li>

        <li class="paper-section">
          <div class="section-heading">
            <div>
              <p class="section-index">05 · 선택 자료</p>
              <h2 class="paper-section-title">포스터 미리보기</h2>
            </div>
          </div>
          <details class="poster-tools">
            <summary>포스터 미리보기·업로드 (선택)</summary>
            <p class="paper-hint">
              포스터는 신청 필수 자료가 아닙니다. 포스터용 날짜·장소는 확정
              일정으로 저장되지 않습니다.
            </p>
            <SeminarPosterSection
              seminarTitle={title}
              seminarDescription={description}
              seminarPrerequisites={prerequisites}
              selectedSpeakers={currentPresenters}
            />
          </details>
        </li>
      </ol>
    </fieldset>
    <p class="submission-note">
      필수 항목을 확인한 뒤 제출해 주세요. 포스터와 외부 자료 링크는 선택입니다.
    </p>

    <div class="paper-actions form-actions">
      <button
        type="submit"
        class="paper-btn primary"
        disabled={processing || !canSubmit || memberDirectoryUnavailable}
        >{processing ? "신청 처리 중…" : submitLabel}</button
      >
      {#if isEdit}<a href="/" class="paper-btn secondary">수정 취소</a>{/if}
    </div>
  </form>
{/if}

<style>
  .proposal-inputs {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .req {
    color: var(--latex-accent);
  }
  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .section-heading .paper-section-title {
    margin-bottom: 0;
  }
  .section-index {
    margin: 0 0 0.25rem;
    color: var(--latex-muted);
    font-family: var(--font-mono);
    font-size: 0.65rem;
  }
  .section-note {
    max-width: 20rem;
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.8rem;
  }
  .kind-fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .kind-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .kind-option {
    min-height: 0;
    padding: 0.85rem;
    border: 1px solid var(--latex-muted);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.65rem;
    align-items: start;
    cursor: pointer;
  }
  .kind-option.selected {
    border-left: 3px solid var(--latex-accent);
    background: var(--latex-surface);
  }
  .kind-option input {
    width: 1.1rem;
    height: 1.1rem;
    margin: 0.3rem 0 0;
    accent-color: var(--latex-text);
  }
  .kind-copy {
    display: grid;
    gap: 0.3rem;
  }
  .kind-copy strong {
    font-size: 0.95rem;
    font-weight: 550;
  }
  .kind-copy small {
    color: var(--latex-muted);
    font-family: var(--font-ui);
    font-size: 0.75rem;
    line-height: 1.6;
  }
  .field-error {
    margin: 0.4rem 0 0;
    color: var(--latex-accent);
    font-family: var(--font-ui);
    font-size: 0.8rem;
  }
  .proposal-inputs :global(.paper-field input),
  .proposal-inputs :global(.paper-field textarea),
  .proposal-inputs :global(.paper-field select) {
    border-color: var(--latex-muted);
  }
  .proposal-inputs :global([aria-invalid="true"]) {
    border-left: 3px solid var(--latex-accent);
  }
  .poster-tools {
    padding: 0.25rem 0;
  }
  .poster-tools > summary {
    min-height: 2.75rem;
    padding: 0.6rem 0;
    cursor: pointer;
    user-select: none;
    font-family: var(--font-ui);
    font-size: 0.85rem;
  }
  .poster-tools > summary:focus-visible {
    outline: 2px solid var(--latex-accent);
    outline-offset: 2px;
  }
  .submission-note {
    margin: 1.1rem 0;
    color: var(--latex-muted);
    font-size: 0.82rem;
  }
  .form-actions {
    justify-content: flex-end;
  }
  .directory-notice {
    padding: 0.8rem 0;
    border-bottom: 1px solid var(--latex-rule);
    color: var(--latex-muted);
    font-size: 0.84rem;
  }
  .directory-notice p {
    margin: 0 0 0.7rem;
  }
  .proposal-receipt {
    padding: 0.6rem 0;
  }
  .receipt-label {
    margin: 0;
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }
  .proposal-receipt h2 {
    margin: 0.4rem 0 1rem;
    font-size: 1.4rem;
    font-weight: 550;
  }
  .proposal-receipt > p:not(.receipt-label) {
    color: var(--latex-muted);
    font-size: 0.9rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (max-width: 620px) {
    .section-heading {
      align-items: start;
      flex-direction: column;
      gap: 0.35rem;
    }
    .kind-grid {
      grid-template-columns: 1fr;
    }
    .form-actions {
      align-items: stretch;
      flex-direction: column;
    }
    .form-actions :global(.paper-btn) {
      width: 100%;
    }
  }
</style>
