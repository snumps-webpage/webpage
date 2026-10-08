<script lang="ts">
  import { enhance } from "$app/forms";
  import { createAttendanceSubmissionGate } from "$lib/client/attendance-submission";
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import {
    attendanceActionError,
    attendanceDateLabel,
  } from "$lib/domain/attendance";

  let { data, form } = $props();
  const submissions = createAttendanceSubmissionGate();
  let processing = $state(false);
  let requestPath = $state(untrack(() => page.url.pathname));
  let received = $state(false);
  let errorMessage = $state<string | null>(null);
  const acknowledged = $derived(received || form?.success === true);
  $effect(() => {
    if (requestPath === page.url.pathname) return;
    submissions.invalidate();
    requestPath = page.url.pathname;
    received = false;
    errorMessage = null;
    processing = false;
  });
  const error = $derived(
    errorMessage ??
      (form?.error ? attendanceActionError(form.error, "request") : null),
  );
</script>

<svelte:head>
  <title>{data.event.title} 출석 요청 · SNUMPS</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<article class="paper-document event-paper">
  <header class="attendance-heading">
    <p>출석 · 회원 확인</p>
    <h1>{data.event.title}</h1>
    <p class="intro">참여한 활동을 확인하고 출석 승인 요청을 보내 주세요.</p>
  </header>

  {#if acknowledged}
    <section
      class="request-received"
      aria-labelledby="received-heading"
      role="status"
    >
      <p class="section-number">§ 02 · 요청 접수</p>
      <h2 id="received-heading">출석 승인 요청을 접수했습니다</h2>
      <p>
        운영진이 승인한 뒤 활동 이력에 반영됩니다. 지금은 요청 접수만 완료된
        상태입니다.
      </p>
      <a href="/" class="paper-btn primary">내 활동으로 돌아가기</a>
    </section>
  {:else}
    <section aria-labelledby="activity-heading" class="activity-confirmation">
      <p class="section-number">§ 01 · 활동 확인</p>
      <h2 id="activity-heading">이 활동에 참여하셨나요?</h2>
      <dl class="event-facts">
        <div>
          <dt>활동</dt>
          <dd>{data.event.type}</dd>
        </div>
        <div>
          <dt>일시 · KST</dt>
          <dd>{attendanceDateLabel(data.event.date)}</dd>
        </div>
        {#if data.context}
          <div>
            <dt>{data.context.primaryLabel}</dt>
            <dd>{data.context.primaryValue}</dd>
          </div>
          <div>
            <dt>{data.context.secondaryLabel}</dt>
            <dd>{data.context.secondaryValue}</dd>
          </div>
        {/if}
      </dl>
      <div class="participant-identity">
        <span>출석 요청 계정</span>
        <strong>{data.user?.name}</strong>
        <span>{data.user?.email}</span>
      </div>
    </section>

    <section class="request-section" aria-labelledby="request-heading">
      <p class="section-number">§ 02 · 출석 요청</p>
      <h2 id="request-heading">운영진에게 출석 확인 요청</h2>
      <p>
        요청을 접수하면 운영진이 확인합니다. 승인 전에는 활동 이력에 출석으로
        반영되지 않습니다.
      </p>
      {#if !data.canAttend}<p class="read-only-note">
          이번 학기 등록 전에는 출석을 요청할 수 없습니다.
        </p>{/if}
      {#if error}<p class="request-error" role="alert">{error}</p>{/if}
      <form
        method="POST"
        action="?/attend"
        use:enhance={({ cancel }) => {
          if (processing || !data.canAttend) {
            cancel();
            return;
          }
          const submittedPath = page.url.pathname;
          const ticket = submissions.begin(submittedPath);
          const ownsResponse = () =>
            submissions.current(ticket, page.url.pathname);
          processing = true;
          errorMessage = null;
          return async ({ result, update }) => {
            try {
              if (!ownsResponse()) return;
              if (result.type === "redirect") {
                await update({ reset: false });
                return;
              }
              if (result.type === "success") {
                received = true;
                return;
              }
              const payload =
                "data" in result ? (result.data as { error?: string }) : null;
              const code =
                payload?.error ??
                (result.type === "error"
                  ? (
                      {
                        401: "UNAUTHORIZED",
                        403: "FORBIDDEN",
                        404: "NOT_FOUND",
                        503: "SERVICE_UNAVAILABLE",
                      } as Record<number, string>
                    )[result.status ?? 500]
                  : undefined);
              errorMessage = attendanceActionError(code, "request");
            } catch {
              if (!ownsResponse()) return;
              errorMessage =
                "접수 결과를 확인하지 못했습니다. 반복 요청은 중복으로 처리되므로 잠시 후 다시 확인해 주세요.";
            } finally {
              if (ownsResponse()) processing = false;
            }
          };
        }}
      >
        <button
          class="paper-btn primary"
          disabled={processing || !data.canAttend}
          aria-busy={processing}
        >
          {processing ? "출석 요청 접수 중…" : "출석 승인 요청 보내기"}
        </button>
      </form>
      <a class="return-link" href="/">나중에 확인하고 돌아가기</a>
    </section>
  {/if}
</article>

<style>
  .event-paper {
    width: min(100%, 680px);
    font-family: var(--font-ui);
  }
  .attendance-heading {
    border-top: 2px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
    padding: 1rem 0 1.2rem;
    margin-bottom: 1.7rem;
  }
  .attendance-heading > p:first-child,
  .section-number {
    margin: 0 0 0.4rem;
    color: var(--latex-muted);
    font-size: 0.74rem;
    font-weight: 650;
    letter-spacing: 0.04em;
  }
  h1 {
    margin: 0;
    font: 550 clamp(1.7rem, 4vw, 2.3rem)/1.4 var(--font-display);
    overflow-wrap: anywhere;
  }
  .intro {
    margin: 0.75rem 0 0;
    color: var(--latex-muted);
    font-size: 0.88rem;
    line-height: 1.75;
  }
  h2 {
    margin: 0 0 0.9rem;
    font: 550 1.3rem/1.5 var(--font-display);
  }
  .event-facts {
    display: grid;
    gap: 0.8rem;
    margin: 0;
  }
  .event-facts div {
    display: grid;
    grid-template-columns: 6rem minmax(0, 1fr);
    gap: 0.8rem;
  }
  dt {
    color: var(--latex-muted);
    font-size: 0.78rem;
  }
  dd {
    margin: 0;
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }
  .participant-identity {
    display: grid;
    gap: 0.35rem;
    margin-top: 1.2rem;
    padding: 0.8rem 1rem;
    border-left: 2px solid var(--latex-rule);
    background: var(--latex-surface);
    overflow-wrap: anywhere;
  }
  .participant-identity span {
    color: var(--latex-muted);
    font-size: 0.76rem;
  }
  .participant-identity strong {
    font-size: 0.9rem;
  }
  .request-section {
    border-top: 1px solid var(--latex-rule);
    margin-top: 1.8rem;
    padding-top: 1.3rem;
  }
  .request-section > p:not(.section-number),
  .request-received > p:not(.section-number) {
    font-size: 0.87rem;
    line-height: 1.8;
  }
  form {
    margin-top: 1rem;
  }
  .return-link {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    margin-top: 0.7rem;
    color: var(--latex-muted);
    font-size: 0.8rem;
    text-underline-offset: 0.2em;
  }
  .request-error {
    padding: 0.8rem;
    border-left: 3px solid var(--latex-accent);
    color: var(--latex-accent);
  }
  .read-only-note {
    color: var(--latex-muted);
  }
  .request-received {
    padding: 1.2rem 0;
  }
  .request-received .paper-btn {
    margin-top: 0.7rem;
  }
  @media (max-width: 480px) {
    .event-facts div {
      grid-template-columns: 1fr;
      gap: 0.3rem;
    }
    form button {
      width: 100%;
    }
  }
</style>
