<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import MembershipApplicationForm from "$lib/components/signup/MembershipApplicationForm.svelte";
  import { actionErrorText } from "$lib/domain/api";
  import { MANUSCRIPT } from "$lib/constants";
  let { data, form } = $props();
</script>

<svelte:head><title>회원가입 신청 · SNUMPS</title></svelte:head>
<article class="paper-document membership-paper">
  <ManuscriptHeader
    title="회원가입 신청"
    subtitle="Membership Application"
    figure={MANUSCRIPT.FIGURES.SIGNUP}
  />
  <p class="intro">
    학교 계정과 연락 정보를 확인해 신청해 주세요. 운영진 승인 후 회원 기능을
    이용할 수 있습니다.
  </p>
  {#if form?.success}<MembershipApplicationForm
      mode="create"
      account={{ ...data.parsedInfo, email: data.user?.email ?? "" }}
      {form}
    />{:else if data.pending}<section
      class="pending-notice"
      aria-labelledby="pending-heading"
    >
      <p>검토 중</p>
      <h2 id="pending-heading">이미 접수된 가입 신청이 있습니다</h2>
      {#if form?.error}<p role="alert">
          {actionErrorText(form, "이미 접수된 신청을 확인해 주세요.")}
        </p>{/if}
      <p>저장된 신청을 확인하거나 수정해 주세요.</p>
      <div class="paper-actions">
        <a href="/wait" class="paper-btn primary">가입 승인 대기 화면</a><a
          href="/signup/edit"
          class="paper-btn">신청 정보 수정</a
        >
      </div>
    </section>{:else}<MembershipApplicationForm
      mode="create"
      account={{ ...data.parsedInfo, email: data.user?.email ?? "" }}
      preview={data.preview}
      {form}
    />{/if}
</article>

<style>
  .membership-paper {
    width: min(100%, 54rem);
  }
  .intro {
    margin: -0.5rem 0 1.75rem;
    color: var(--latex-muted);
    font-size: 0.9rem;
  }
  .pending-notice > p:first-child {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--latex-accent);
  }
  .pending-notice h2 {
    font-size: 1.35rem;
    font-weight: 550;
  }
</style>
