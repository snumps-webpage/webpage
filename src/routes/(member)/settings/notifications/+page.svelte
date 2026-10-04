<script lang="ts">
  import { enhance } from "$app/forms";
  import { tick } from "svelte";
  import type { SubmitFunction } from "@sveltejs/kit";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import AccountSettingsNav from "$lib/components/account/AccountSettingsNav.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  import {
    preferenceFeedback,
    type PreferenceActionState,
    type PreferenceOperation,
  } from "$lib/domain/account-preferences";

  let { data, form } = $props();
  let saving = $state<PreferenceOperation | null>(null);
  const feedback = $derived(
    preferenceFeedback(form as PreferenceActionState | null),
  );

  function savePreference(operation: PreferenceOperation): SubmitFunction {
    return ({ cancel, formElement }) => {
      if (saving) {
        cancel();
        return;
      }
      const article = formElement.closest("article");
      saving = operation;
      return async ({ result, update }) => {
        try {
          await update();
        } finally {
          saving = null;
        }
        if (result.type === "success" || result.type === "failure") {
          await tick();
          article?.querySelector<HTMLElement>(".result-note")?.focus();
        }
      };
    };
  }
</script>

<svelte:head>
  <title>공지·연락처 설정 · SNUMPS</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<article class="paper-document settings-paper">
  <ManuscriptHeader
    title="공지·연락처 설정"
    subtitle="Announcement & Contact Preferences"
    figure={MANUSCRIPT.FIGURES.NOTIFICATIONS}
  />
  <AccountSettingsNav current="notifications" />

  {#if feedback && !saving}
    <p
      class="result-note"
      class:error={feedback.error}
      role={feedback.error ? "alert" : "status"}
      tabindex="-1"
    >
      {feedback.text}
    </p>
  {/if}

  <section class="preference-card" aria-labelledby="announcement-heading">
    <div class="preference-copy">
      <p class="section-index">01 · Announcements</p>
      <h2 id="announcement-heading">전 회원 공지 메일</h2>
      <p id="announcement-scope">
        승인된 세미나, 확정 일정, 공개 후 일정 변경·취소와 주요 동아리 공지를
        받습니다. 최신 일정은 웹페이지에서도 확인할 수 있습니다.
      </p>
    </div>
    <div class="preference-control">
      <span class:enabled={data.mailPrefs.announcements} class="status-mark">
        {data.mailPrefs.announcements ? "수신 중" : "수신 안 함"}
      </span>
      <form
        method="POST"
        action="?/setMailPref"
        aria-describedby="announcement-scope"
        aria-busy={saving === "mailPreferenceUpdated"}
        use:enhance={savePreference("mailPreferenceUpdated")}
      >
        <input type="hidden" name="type" value="announcements" />
        <input
          type="hidden"
          name="enabled"
          value={data.mailPrefs.announcements ? "false" : "true"}
        />
        <button class="paper-btn" disabled={!!saving}>
          {saving === "mailPreferenceUpdated"
            ? "공지 설정 저장 중…"
            : data.mailPrefs.announcements
              ? "공지 메일 수신 중지"
              : "공지 메일 다시 받기"}
        </button>
      </form>
    </div>
  </section>

  <dl class="policy-grid">
    <div>
      <dt>수신 주소</dt>
      <dd>{data.email || "수신 주소 확인 필요"}</dd>
    </div>
    <div>
      <dt>적용 범위</dt>
      <dd>전 회원 공지</dd>
    </div>
    <div>
      <dt>발송 방식</dt>
      <dd>Bcc 전용</dd>
    </div>
  </dl>
  <p class="footnote">
    * 가입·출석 처리처럼 계정 운영에 필요한 개별 알림은 이 설정과 별개입니다.
  </p>

  {#if data.isCurrentExecutive}
    <section
      class="preference-card phone-preference"
      aria-labelledby="phone-heading"
    >
      <div class="preference-copy">
        <p class="section-index">02 · Public Contact</p>
        <h2 id="phone-heading">회장단 전화번호 공개</h2>
        <p id="phone-scope">
          현 회장·부회장의 전화번호는 역대 회장단 페이지와 사이트 하단에 자동
          공개됩니다. 공개를 원치 않으면 아래에서 끌 수 있습니다.
        </p>
        {#if !data.phone}
          <p class="footnote">
            현재 번호가 비어 있으면 기존 회장단 기록의 연락처가 사용될 수
            있습니다. 공개 범위를 먼저 확인해 주세요.
          </p>
        {/if}
        <dl class="phone-record">
          <div>
            <dt>내 연락처</dt>
            <dd>{data.phone || "등록된 번호 없음"}</dd>
          </div>
        </dl>
      </div>
      <div class="preference-control">
        <span class:enabled={!data.hidePublicPhone} class="status-mark">
          {data.hidePublicPhone ? "비공개 설정" : "공개 설정"}
        </span>
        {#snippet phoneForm()}
          <form
            method="POST"
            action="?/setPhonePublic"
            aria-describedby="phone-scope"
            aria-busy={saving === "phonePreferenceUpdated"}
            use:enhance={savePreference("phonePreferenceUpdated")}
          >
            <input
              type="hidden"
              name="hide"
              value={data.hidePublicPhone ? "false" : "true"}
            />
            <button class="paper-btn" disabled={!!saving}>
              {saving === "phonePreferenceUpdated"
                ? "공개 설정 저장 중…"
                : data.hidePublicPhone
                  ? "확인 후 전화번호 공개"
                  : "전화번호 공개 중지"}
            </button>
          </form>
        {/snippet}
        {#if data.hidePublicPhone}
          <details class="publish-confirmation">
            <summary>전화번호 공개하기</summary>
            <p>
              공개하면 회장단 연락처를 로그인하지 않은 방문자도 볼 수 있습니다.
            </p>
            {@render phoneForm()}
          </details>
        {:else}
          {@render phoneForm()}
        {/if}
      </div>
    </section>
  {/if}
</article>

<style>
  .settings-paper {
    width: min(100%, 50rem);
  }
  .result-note {
    margin: 0 0 0.8rem;
    padding: 0.65rem 0.75rem;
    border-left: 4px solid var(--latex-text);
    background: color-mix(in srgb, var(--latex-rule) 12%, transparent);
    font-size: 0.78rem;
  }
  .result-note.error {
    border-color: var(--color-danger-text);
    color: var(--color-danger-text);
  }
  .preference-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: center;
    padding: clamp(1rem, 3vw, 1.35rem);
    border: 1px solid var(--latex-rule);
  }
  .section-index {
    margin: 0;
    color: var(--latex-accent);
    font: 700 0.58rem/1 var(--font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  h2 {
    margin: 0.35rem 0 0;
    line-height: 1.45;
    font-size: 1.22rem;
    font-weight: 560;
  }
  .preference-copy > p:last-child {
    max-width: 38rem;
    margin: 0.6rem 0 0;
    color: var(--latex-muted);
    font-size: 0.78rem;
    line-height: 1.7;
  }
  .preference-control {
    display: grid;
    justify-items: end;
    gap: 0.65rem;
    min-width: 11rem;
    max-width: 16rem;
  }
  .status-mark {
    padding-left: 0.75rem;
    color: var(--latex-muted);
    font: 700 0.65rem/1 var(--font-mono);
    position: relative;
  }
  .status-mark::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    width: 0.42rem;
    height: 0.42rem;
    border: 1px solid currentColor;
    transform: translateY(-50%);
  }
  .status-mark.enabled {
    color: var(--latex-text);
  }
  .status-mark.enabled::before {
    background: currentColor;
  }
  .phone-preference {
    margin-top: 1.7rem;
    border-top-width: 2px;
  }
  .phone-record {
    margin: 0.85rem 0 0;
  }
  .publish-confirmation {
    width: 100%;
    font-size: 0.75rem;
  }
  .publish-confirmation summary {
    min-height: 2.75rem;
    display: list-item;
    padding: 0.75rem;
    border: 1px solid var(--latex-rule);
    cursor: pointer;
    user-select: none;
  }
  .publish-confirmation p {
    margin: 0.7rem 0;
    color: var(--latex-muted);
    font-size: 0.72rem;
    line-height: 1.6;
  }
  .preference-control :global(button) {
    min-height: 2.75rem;
  }
  .result-note:focus,
  .publish-confirmation summary:focus-visible {
    outline: 2px solid var(--latex-text);
    outline-offset: 3px;
  }
  .policy-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 0.8rem 0 0;
    border: 1px solid var(--latex-rule);
  }
  .policy-grid div {
    min-width: 0;
    padding: 0.7rem;
  }
  .policy-grid div + div {
    border-left: 1px solid var(--latex-rule);
  }
  dt {
    color: var(--latex-muted);
    font: 700 0.55rem/1.2 var(--font-mono);
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }
  dd {
    margin: 0.25rem 0 0;
    overflow-wrap: anywhere;
    font-size: 0.76rem;
  }
  .footnote {
    margin: 0.75rem 0 0;
    color: var(--latex-muted);
    font-size: 0.68rem;
    line-height: 1.6;
  }
  @media (max-width: 640px) {
    .preference-card {
      grid-template-columns: 1fr;
    }
    .preference-control {
      max-width: none;
      justify-items: stretch;
      min-width: 0;
    }
    .preference-control :global(.paper-btn) {
      width: 100%;
    }
    .policy-grid {
      grid-template-columns: 1fr;
    }
    .policy-grid div + div {
      border-left: 0;
      border-top: 1px solid var(--latex-rule);
    }
  }
</style>
