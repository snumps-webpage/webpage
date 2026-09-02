<script lang="ts">
  import { enhance } from "$app/forms";
  import { tick, untrack } from "svelte";
  import SeminarPosterSection from "$lib/components/poster/SeminarPosterSection.svelte";
  import SpeakerSelector from "$lib/components/poster/SpeakerSelector.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import SuccessScreen from "$lib/components/SuccessScreen.svelte";
  import type {
    MemberPickerItem,
    SeminarFormIssues,
    SeminarKind,
    SeminarRequestField,
    SeminarRequestFormValues,
  } from "$lib/domain/seminars";

  interface ActionState {
    success?: boolean;
    operation?: "requestSubmitted" | "requestUpdated" | "requestWithdrawn";
    error?: string;
    issues?: SeminarFormIssues;
    values?: Partial<SeminarRequestFormValues>;
  }

  interface Props {
    mode: "create" | "edit";
    members: MemberPickerItem[];
    memberDirectoryUnavailable?: boolean;
    initialValues?: Partial<SeminarRequestFormValues>;
    initialPresenters?: MemberPickerItem[];
    /** 현재 학기 활동월 선택지 (서버 계산 — 방학 제외) */
    timingOptions?: string[];
    form?: ActionState | null;
  }

  let {
    mode,
    members,
    memberDirectoryUnavailable = false,
    initialValues = {},
    initialPresenters = [],
    timingOptions = [],
    form = null,
  }: Props = $props();

  const { startingValues, startingPresenters } = untrack(() => {
    const submittedValues = form?.values ?? {};
    const values = { ...initialValues, ...submittedValues };
    const submittedPresenterIds = new Set(values.presenterIds ?? []);

    return {
      startingValues: values,
      startingPresenters:
        submittedPresenterIds.size > 0
          ? members.filter((member) => submittedPresenterIds.has(member.id))
          : initialPresenters,
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
  let showSearch = $state(false);
  let processing = $state(false);
  let formElement = $state<HTMLFormElement>();

  let clearedIssueFields = $state<SeminarRequestField[]>([]);
  let issues = $derived(
    Object.fromEntries(
      Object.entries(form?.issues ?? {}).filter(
        ([field]) =>
          !clearedIssueFields.includes(field as SeminarRequestField),
      ),
    ) as SeminarFormIssues,
  );

  $effect(() => {
    if (selectedPresenters.length > 0) clearIssue("presenterIds");
  });

  function clearIssue(field: keyof SeminarFormIssues) {
    if (!issues[field] || clearedIssueFields.includes(field)) return;
    clearedIssueFields = [...clearedIssueFields, field];
  }

  function actionErrorMessage(code: string | undefined) {
    switch (code) {
      case undefined:
      case "VALIDATION_FAILED":
        return null;
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
    issues._form ?? actionErrorMessage(form?.error),
  );

  const isEdit = untrack(() => mode === "edit");
  const submitLabel = isEdit ? "수정 사항 저장" : "개설 신청 제출";
  const successTitle = $derived(
    form?.operation === "requestWithdrawn"
      ? "세미나 신청을 철회했습니다."
      : isEdit
        ? "신청 정보가 수정되었습니다."
        : "세미나 신청이 접수되었습니다.",
  );
  const successDescription = $derived(
    form?.operation === "requestWithdrawn"
      ? "철회된 신청은 더 이상 관리자 심사 목록에 표시되지 않습니다."
      : isEdit
        ? "수정된 원고를 기준으로 관리자 검토가 이어집니다."
        : "승인 결과는 이메일로 안내되며, 일정은 승인 후 운영진과 조율합니다.",
  );
</script>

{#if form?.success}
  <SuccessScreen
    title={successTitle}
    description={successDescription}
    buttonLabel="대시보드로 돌아가기"
  />
{:else if processing}
  <div class="processing-container" aria-live="polite">
    <div class="processing-card">
      <Skeleton height="320px" borderRadius="0" />
      <div class="processing-overlay">
        <div class="spinner" aria-hidden="true"></div>
        <p>{isEdit ? "수정 원고를 제출하고 있습니다." : "신청 원고를 제출하고 있습니다."}</p>
        <span class="paper-hint">잠시만 기다려 주세요.</span>
      </div>
    </div>
  </div>
{:else}
  <form
    bind:this={formElement}
    method="POST"
    action={isEdit ? "?/update" : undefined}
    use:enhance={() => {
      clearedIssueFields = [];
      processing = true;
      return async ({ update }) => {
        await update({ reset: false });
        processing = false;
        await tick();
        formElement
          ?.querySelector<HTMLElement>(
            '.kind-fieldset.invalid input, input[aria-invalid="true"], textarea[aria-invalid="true"], .add-speaker-btn.invalid',
          )
          ?.focus();
      };
    }}
  >
    {#if formError}
      <p class="paper-status-note error" role="alert">{formError}</p>
    {/if}

    <ol class="paper-sections">
      <li class="paper-section">
        <div class="section-heading">
          <div>
            <p class="section-index">01 · Classification</p>
            <h2 class="paper-section-title">운영 방식</h2>
          </div>
          <p class="section-note">신청 한 건은 발표 한 건을 의미합니다.</p>
        </div>

        <fieldset
          class="kind-fieldset"
          aria-describedby={issues.kind ? "kind-error" : "kind-hint"}
          class:invalid={!!issues.kind}
        >
          <legend class="paper-label">세미나 구분 <span class="req">*</span></legend>
          <div class="kind-grid">
            <label class="kind-option" class:selected={kind === "regular"}>
              <input
                type="radio"
                name="kind"
                value="regular"
                bind:group={kind}
                onchange={() => clearIssue("kind")}
              />
              <span class="kind-symbol" aria-hidden="true">R</span>
              <span class="kind-copy">
                <strong>정기 세미나</strong>
                <small>학기 초 모집 후 운영진이 정기 슬롯에 배치합니다.</small>
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
              <span class="kind-symbol" aria-hidden="true">I</span>
              <span class="kind-copy">
                <strong>비정기 세미나</strong>
                <small>주제를 먼저 승인하고 발표자와 일정을 따로 조율합니다.</small>
              </span>
            </label>
          </div>
          {#if issues.kind}
            <p class="field-error" id="kind-error">{issues.kind}</p>
          {:else}
            <p class="paper-hint" id="kind-hint">신청 단계에서는 날짜를 입력하지 않습니다.</p>
          {/if}
        </fieldset>
      </li>

      <li class="paper-section">
        <div class="section-heading">
          <div>
            <p class="section-index">02 · Abstract</p>
            <h2 class="paper-section-title">세미나 원고</h2>
          </div>
        </div>

        <div class="paper-field">
          <label for="title" class="paper-label">세미나 주제 <span class="req">*</span></label>
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
          {#if issues.title}<p class="field-error" id="title-error">{issues.title}</p>{/if}
        </div>

        <div class="paper-field">
          <label for="description" class="paper-label">세미나 설명 <span class="req">*</span></label>
          <textarea
            id="description"
            name="description"
            bind:value={description}
            oninput={() => clearIssue("description")}
            rows="5"
            maxlength="4000"
            aria-invalid={!!issues.description}
            aria-describedby={issues.description ? "description-error" : undefined}
            placeholder="다룰 내용과 세미나의 목적을 적어 주세요."
          ></textarea>
          {#if issues.description}<p class="field-error" id="description-error">{issues.description}</p>{/if}
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
            aria-describedby={issues.prerequisites ? "prerequisites-error" : undefined}
            placeholder="필요한 배경 지식이 없다면 비워 두어도 됩니다."
          ></textarea>
          {#if issues.prerequisites}<p class="field-error" id="prerequisites-error">{issues.prerequisites}</p>{/if}
        </div>
      </li>

      <li class="paper-section">
        <div class="section-heading">
          <div>
            <p class="section-index">03 · Logistics</p>
            <h2 class="paper-section-title">진행 정보</h2>
          </div>
        </div>

        <div class="paper-field">
          <label for="duration" class="paper-label">예상 소요 시간 <span class="req">*</span></label>
          <input
            type="text"
            id="duration"
            name="duration"
            bind:value={duration}
            oninput={() => clearIssue("duration")}
            maxlength="80"
            aria-invalid={!!issues.duration}
            aria-describedby={issues.duration ? "duration-error" : "duration-hint"}
            placeholder="예: 90분"
          />
          {#if issues.duration}
            <p class="field-error" id="duration-error">{issues.duration}</p>
          {:else}
            <p class="paper-hint" id="duration-hint">날짜·시간·장소는 승인 후 운영진과 조율합니다.</p>
          {/if}
        </div>

        <div class="paper-field">
          <label for="preferredTiming" class="paper-label">선호 세미나 시점</label>
          <select id="preferredTiming" name="preferredTiming" bind:value={preferredTiming}>
            <option value="">선택 안 함</option>
            {#each timingOptions as opt (opt)}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
          <p class="paper-hint">대략적인 선호 시점입니다. 구체 일정은 승인 후 조율합니다.</p>
        </div>

        <div class="paper-field">
          <label for="attachmentUrl" class="paper-label">외부 첨부 URL</label>
          <input
            type="url"
            id="attachmentUrl"
            name="attachment"
            bind:value={attachmentUrl}
            oninput={() => clearIssue("attachmentUrl")}
            inputmode="url"
            aria-invalid={!!issues.attachmentUrl}
            aria-describedby={issues.attachmentUrl ? "attachment-error" : "attachment-hint"}
            placeholder="https://drive.google.com/..."
          />
          {#if issues.attachmentUrl}
            <p class="field-error" id="attachment-error">{issues.attachmentUrl}</p>
          {:else}
            <p class="paper-hint" id="attachment-hint">강의 자료나 계획서가 있다면 HTTPS 링크를 입력해 주세요.</p>
          {/if}
        </div>
      </li>

      <li class="paper-section">
        <div class="section-heading">
          <div>
            <p class="section-index">04 · Presenters</p>
            <h2 class="paper-section-title">발표자</h2>
          </div>
        </div>
        <SpeakerSelector
          bind:selectedSpeakers={selectedPresenters}
          {members}
          {memberDirectoryUnavailable}
          bind:showSearch
          error={issues.presenterIds}
        />
        <input
          type="hidden"
          name="speakerIds"
          value={selectedPresenters.map((presenter) => presenter.id).join(",")}
        />
      </li>

      <li class="paper-section">
        <div class="section-heading">
          <div>
            <p class="section-index">05 · Figure</p>
            <h2 class="paper-section-title">포스터 미리보기</h2>
          </div>
        </div>
        <SeminarPosterSection
          seminarTitle={title}
          seminarDescription={description}
          seminarPrerequisites={prerequisites}
          selectedSpeakers={selectedPresenters}
        />
      </li>
    </ol>

    <div class="paper-actions form-actions">
      <button class="paper-btn primary" disabled={processing}>{submitLabel}</button>
      {#if isEdit}<a href="/" class="paper-btn secondary">수정 취소</a>{/if}
    </div>
  </form>
{/if}

<style>
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
    margin: 0 0 0.2rem;
    color: var(--latex-accent);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .section-note {
    max-width: 20rem;
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.82rem;
    text-align: right;
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
    gap: 0.7rem;
  }

  .kind-option {
    position: relative;
    min-height: 7.2rem;
    padding: 0.9rem;
    border: 1px solid var(--latex-rule);
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: start;
    gap: 0.75rem;
    cursor: pointer;
    background: var(--latex-bg);
    transition:
      background-color 0.16s ease,
      color 0.16s ease;
  }

  .kind-option:hover,
  .kind-option.selected {
    background: var(--latex-text);
    color: var(--latex-bg);
  }

  .kind-option input {
    position: absolute;
    inset: 0;
    z-index: 2;
    opacity: 0;
    cursor: pointer;
  }

  .kind-option:has(input:focus-visible) {
    outline: 2px solid var(--latex-accent);
    outline-offset: 2px;
  }

  .kind-symbol {
    width: 2rem;
    height: 2rem;
    border: 1px solid currentColor;
    display: grid;
    place-items: center;
    font-family: var(--font-math);
    font-size: 1.05rem;
  }

  .kind-copy {
    display: grid;
    gap: 0.35rem;
  }

  .kind-copy strong {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 600;
  }

  .kind-copy small {
    color: inherit;
    font-size: 0.8rem;
    line-height: 1.55;
    opacity: 0.82;
  }

  .field-error {
    margin: 0.38rem 0 0;
    color: var(--latex-accent);
    font-size: 0.8rem;
    font-weight: 600;
  }

  :global(.paper-field [aria-invalid="true"]) {
    border-left: 4px solid var(--latex-accent);
  }

  .form-actions {
    justify-content: flex-end;
  }

  .processing-container {
    padding: 0.95rem 0;
    border-top: 2px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
  }

  .processing-card {
    position: relative;
    border: 1px solid var(--latex-rule);
  }

  .processing-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    background: color-mix(in srgb, var(--latex-bg) 88%, transparent);
    text-align: center;
  }

  .processing-overlay p {
    margin: 0;
    color: var(--latex-text);
    font-family: var(--font-display);
    font-size: 1.08rem;
    font-weight: 540;
  }

  .spinner {
    width: 1.15rem;
    height: 1.15rem;
    border: 2px solid var(--latex-rule);
    border-right-color: transparent;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 620px) {
    .section-heading {
      align-items: start;
      flex-direction: column;
      gap: 0.35rem;
    }

    .section-note {
      max-width: none;
      text-align: left;
    }

    .kind-grid {
      grid-template-columns: 1fr;
    }

    .kind-option {
      min-height: 0;
    }

    .form-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .form-actions :global(.paper-btn) {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>
