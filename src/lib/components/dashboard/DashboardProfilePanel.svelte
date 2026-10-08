<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import { createAttendanceSubmissionGate } from "$lib/client/attendance-submission";
  import { actionErrorText } from "$lib/domain/api";
  import { onDestroy, untrack } from "svelte";
  import { SvelteURLSearchParams } from "svelte/reactivity";
  import { beforeNavigate } from "$app/navigation";
  import type {
    DashboardOperationResult,
    DashboardProfile,
  } from "$lib/domain/dashboard";

  let {
    initialProfile,
    canManageSelf = true,
    form = null,
  }: {
    initialProfile: DashboardProfile;
    canManageSelf?: boolean;
    form?: unknown;
  } = $props();
  let profile = $state({ ...untrack(() => initialProfile) });
  let profileOwner = $state(untrack(() => initialProfile.email));
  const submissions = createAttendanceSubmissionGate();
  beforeNavigate(() => {
    submissions.invalidate();
    processing = false;
  });
  onDestroy(() => submissions.invalidate());
  const profileAction = $derived.by(() => {
    const query = new SvelteURLSearchParams(page.url.search);
    for (const key of [...query.keys()])
      if (key.startsWith("/")) query.delete(key);
    query.set("/updateProfile", "");
    return `?${query}`;
  });
  const nativeProfile = $derived(
    form &&
      typeof form === "object" &&
      ((form as { operation?: string }).operation === "profileUpdated" ||
        page.url.searchParams.has("/updateProfile"))
      ? (form as {
          success?: boolean;
          error?: string;
          issues?: Partial<Record<"phone" | "background" | "_form", string>>;
        })
      : null,
  );
  let open = $state(untrack(() => !!nativeProfile));
  let processing = $state(false);
  let notice = $state<string | null>(
    untrack(() =>
      nativeProfile?.success ? "회원 정보를 저장했습니다." : null,
    ),
  );
  let issues = $state<
    Partial<Record<"phone" | "background" | "_form", string>>
  >(
    untrack(
      () =>
        nativeProfile?.issues ??
        (nativeProfile?.error
          ? {
              _form: actionErrorText(
                { error: nativeProfile.error },
                "회원 정보를 저장하지 못했습니다.",
              ),
            }
          : {}),
    ),
  );
  $effect(() => {
    if (profileOwner !== initialProfile.email) {
      submissions.invalidate();
      profileOwner = initialProfile.email;
      profile = { ...initialProfile };
      open = false;
      processing = false;
      notice = null;
      issues = {};
    } else if (
      !open &&
      !processing &&
      (profile.phone !== initialProfile.phone ||
        profile.background !== initialProfile.background ||
        profile.name !== initialProfile.name ||
        profile.department !== initialProfile.department)
    ) {
      profile = { ...initialProfile };
    }
  });
</script>

<section class="profile-panel">
  <button
    class="panel-heading"
    type="button"
    aria-expanded={open && canManageSelf}
    disabled={!canManageSelf || processing}
    onclick={() => (open = !open)}
  >
    <span><small>계정 정보</small><strong>내 정보</strong></span>
    <span>{open && canManageSelf ? "−" : "+"}</span>
  </button>

  <div class="identity-line">
    <strong>{profile.name}</strong>
    <span>{profile.department}</span>
    <span>{profile.email}</span>
  </div>

  {#if !canManageSelf}<p class="readonly-profile">
      현재 계정 상태에서는 회원 정보를 변경할 수 없습니다.
    </p>{/if}
  {#if open && canManageSelf}
    <form
      method="POST"
      action={profileAction}
      use:enhance={({ cancel }) => {
        if (processing || !canManageSelf) {
          cancel();
          return;
        }
        const ticket = submissions.begin(initialProfile.email);
        const ownsResponse = () =>
          submissions.current(ticket, initialProfile.email);
        processing = true;
        notice = null;
        issues = {};
        return async ({ result, update }) => {
          try {
            if (!ownsResponse()) return;
            if (result.type === "redirect") {
              await update({ reset: false });
              return;
            }
            if (result.type === "success") {
              const payload = result.data as DashboardOperationResult;
              if (payload.operation === "profileUpdated") {
                await update({ reset: false });
                if (!ownsResponse()) return;
                profile.phone = payload.profile.phone;
                profile.background = payload.profile.background;
                notice = "회원 정보를 저장했습니다.";
              }
              return;
            }
            if (result.type === "failure") {
              const payload = result.data as {
                issues?: typeof issues;
                error?: string;
              };
              issues = payload.issues ?? {
                _form: actionErrorText(
                  payload,
                  "회원 정보를 저장하지 못했습니다.",
                ),
              };
            } else {
              issues = { _form: "회원 정보를 저장하지 못했습니다." };
            }
          } catch {
            if (ownsResponse())
              issues = {
                _form:
                  "처리 결과를 새로 불러오지 못했습니다. 저장되었을 수 있으니 다시 확인해 주세요.",
              };
          } finally {
            if (ownsResponse()) processing = false;
          }
        };
      }}
    >
      {#if notice}<p class="form-notice" role="status">{notice}</p>{/if}
      {#if issues._form}<p class="field-error" role="alert">
          {issues._form}
        </p>{/if}
      <label for="dashboard-phone">전화번호</label>
      <input
        id="dashboard-phone"
        name="phone"
        type="tel"
        value={profile.phone}
        aria-invalid={!!issues.phone}
      />
      {#if issues.phone}<p class="field-error">{issues.phone}</p>{/if}
      <label for="dashboard-background">관심 분야와 배경지식</label>
      <textarea
        id="dashboard-background"
        name="background"
        rows="4"
        aria-invalid={!!issues.background}>{profile.background}</textarea
      >
      {#if issues.background}<p class="field-error">{issues.background}</p>{/if}
      <button class="paper-btn primary" disabled={processing}
        >{processing ? "저장 중…" : "정보 저장"}</button
      >
    </form>
  {/if}
</section>

<style>
  .profile-panel {
    margin-top: 1.7rem;
    font-family: var(--font-ui);
    border: 1px solid var(--latex-rule);
  }
  .panel-heading {
    min-height: 44px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.7rem 0.8rem;
    border: 0;
    border-bottom: 1px solid var(--latex-rule);
    background: transparent;
    color: var(--latex-text);
    text-align: left;
    cursor: pointer;
  }
  .panel-heading span:first-child {
    display: grid;
    gap: 0.18rem;
  }
  .panel-heading small,
  label {
    color: var(--latex-muted);
    font: 700 0.58rem/1.2 var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .panel-heading strong {
    font-family: var(--font-display);
    font-size: 0.95rem;
  }
  .panel-heading > span:last-child {
    font: 1.1rem/1 var(--font-mono);
  }
  .identity-line {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    gap: 0.4rem 0.75rem;
    align-items: baseline;
    padding: 0.7rem 0.8rem;
  }
  .identity-line strong {
    font-size: 0.82rem;
  }
  .identity-line span {
    color: var(--latex-muted);
    font-size: 0.7rem;
    overflow-wrap: anywhere;
  }
  form {
    display: grid;
    gap: 0.4rem;
    padding: 0.8rem;
    border-top: 1px solid var(--latex-rule);
  }
  input,
  textarea {
    width: 100%;
    border: 1px solid var(--latex-rule);
    background: var(--latex-bg);
    color: var(--latex-text);
  }
  label:not(:first-of-type) {
    margin-top: 0.35rem;
  }
  button.paper-btn {
    justify-self: end;
    margin-top: 0.35rem;
  }
  .readonly-profile {
    padding: 0.7rem 0.8rem;
    color: var(--latex-muted);
    font-size: 0.82rem;
  }
  .field-error,
  .form-notice {
    margin: 0;
    font-size: 0.68rem;
  }
  .field-error {
    color: var(--color-danger-text);
  }
  .form-notice {
    color: var(--latex-muted);
  }
  @media (max-width: 620px) {
    .identity-line {
      grid-template-columns: 1fr 1fr;
    }
    .identity-line span:last-child {
      grid-column: 1 / -1;
    }
  }
</style>
