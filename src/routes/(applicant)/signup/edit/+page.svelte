<script lang="ts">
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import MembershipApplicationForm from "$lib/components/signup/MembershipApplicationForm.svelte";
  import { MANUSCRIPT } from "$lib/constants";
  let { data, form } = $props();
</script>

<svelte:head><title>가입 신청 수정 · SNUMPS</title></svelte:head>
<article class="paper-document membership-paper">
  <nav class="back-link" aria-label="가입 신청 경로">
    <a href="/wait">← 가입 승인 대기</a>
  </nav>
  <ManuscriptHeader
    title="가입 신청 수정"
    subtitle="Membership Application Revision"
    figure={MANUSCRIPT.FIGURES.REVISION}
  />
  <p class="intro">
    승인 대기 중인 신청 정보를 수정합니다. 학번·연락처·배경지식을 확인한 뒤
    저장해 주세요.
  </p>
  <MembershipApplicationForm
    mode="edit"
    account={{ ...data.parsedInfo, email: data.user?.email ?? "" }}
    initialValues={{
      phone: data.application.phone,
      studentId: data.application.studentId,
      background: data.application.background,
    }}
    {form}
  />{#if !form?.success}<p class="withdraw-link">
      신청을 철회하려면 <a href="/wait#withdraw-application"
        >대기 화면에서 저장된 신청과 철회 안내를 확인해 주세요</a
      >. 저장하지 않은 수정 내용은 반영되지 않습니다.
    </p>{/if}
</article>

<style>
  .membership-paper {
    width: min(100%, 54rem);
  }
  .back-link {
    margin-bottom: 1.25rem;
    font-family: var(--font-ui);
    font-size: 0.8rem;
  }
  .intro {
    margin: -0.5rem 0 1.75rem;
    color: var(--latex-muted);
    font-size: 0.9rem;
  }
  .withdraw-link {
    margin: 1.5rem 0 0;
    padding-top: 1rem;
    border-top: 1px solid var(--latex-rule);
    font-size: 0.82rem;
    color: var(--latex-muted);
  }
</style>
