<script lang="ts">
  import { page } from "$app/state";
  import DashboardActivityLedger from "$lib/components/dashboard/DashboardActivityLedger.svelte";
  import DashboardProfilePanel from "$lib/components/dashboard/DashboardProfilePanel.svelte";
  import DashboardWorkSummary from "$lib/components/dashboard/DashboardWorkSummary.svelte";
  import GuestLanding from "$lib/components/dashboard/GuestLanding.svelte";
  import { toExecutiveRoster } from "$lib/domain/executive-roster";

  let { data, form } = $props();
  const session = $derived(page.data.session);
</script>

<svelte:head>
  <title
    >{session?.user
      ? "내 활동 · SNUMPS"
      : "서울대학교 수학문제연구회 SNUMPS"}</title
  >
</svelte:head>

{#if session?.user}
  {#await data.streamed.dashboard then dashboard}
    {#if dashboard && !("error" in dashboard)}
      {@const requestedSemester = page.url.searchParams.get("semester")}
      {@const selectedSemester =
        requestedSemester && dashboard.semesters.includes(requestedSemester)
          ? requestedSemester
          : data.currentSemesterKey}
      {@const activities = dashboard.activities.filter(
        (activity) => activity.semester === selectedSemester,
      )}
      {@const studies = dashboard.myStudies.map((study) => ({
        id: study.id,
        title: study.title,
        semester: study.semester,
        status: study.status,
        relationship: study.role,
        canManage: study.role === "organizer",
      }))}
      {@const pendingTransfer = dashboard.pendingTransfers[0]
        ? {
            studyTitle: dashboard.pendingTransfers[0].title,
            fromMemberName: dashboard.pendingTransfers[0].fromMemberName,
          }
        : null}
      <article class="paper-document dashboard-paper">
        <header class="dashboard-heading">
          <p class="home-kicker">회원 홈</p>
          <h1>내 활동</h1>
          <p class="member-identity">
            {dashboard.profile.name}
            <span>· {dashboard.profile.department}</span>
          </p>
          <p class="home-intro">
            내 신청과 스터디 상태를 확인하고, 참여할 활동과 출석 기록으로
            이어갑니다.
          </p>
        </header>
        {#if !data.canParticipate}<p class="read-only-note">
            현재 등록 상태에서는 참여 신청과 출석 요청이 제한됩니다. 기존 기록과
            내 신청은 확인할 수 있습니다. <a href="/signup">학기 등록 확인</a>
          </p>{/if}
        <nav class="home-shortcuts" aria-label="회원 홈 바로가기">
          <a href="#home-activities">활동·출석 기록</a>
          {#if data.canViewMemberZone}<a href="/study">스터디 찾아보기</a>{/if}
          {#if data.canParticipate}<a href="/seminar/apply">세미나 제안하기</a
            >{/if}
          <a href="#home-profile">내 정보</a>
        </nav>

        <DashboardWorkSummary
          requests={dashboard.seminarRequests}
          {studies}
          {pendingTransfer}
          canParticipate={data.canParticipate}
          canViewMemberZone={data.canViewMemberZone}
          pendingTransferCount={dashboard.pendingTransfers.length}
        />

        {#key selectedSemester}
          <DashboardActivityLedger
            initialActivities={activities}
            semesters={dashboard.semesters}
            {selectedSemester}
            currentSemester={data.currentSemesterKey}
            {form}
          />
        {/key}

        <div id="home-profile">
          <DashboardProfilePanel
            initialProfile={dashboard.profile}
            canManageSelf={data.canManageSelf}
            {form}
          />
        </div>

        <p class="generated-at">
          데이터 기준 {new Date(dashboard.generatedAt).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          })}
        </p>
      </article>
    {:else}
      <article class="paper-document dashboard-error" role="alert">
        <h1>내 활동을 불러오지 못했습니다</h1>
        <p>
          잠시 후 다시 불러와 주세요. 계속 문제가 생기면 현재 로그인 계정을
          확인해 주세요.
        </p>
        <a
          class="paper-btn primary"
          href={`${page.url.pathname}${page.url.search}`}
          data-sveltekit-reload>다시 불러오기</a
        ><a href="/archive">공개 활동 기록 보기</a>
      </article>
    {/if}
  {:catch}
    <article class="paper-document dashboard-error" role="alert">
      <h1>내 활동을 불러오지 못했습니다</h1>
      <p>잠시 후 다시 불러와 주세요.</p>
      <a
        class="paper-btn primary"
        href={`${page.url.pathname}${page.url.search}`}
        data-sveltekit-reload>다시 불러오기</a
      >
    </article>
  {/await}
{:else}
  {#await page.data.executives then executiveTerms}
    <GuestLanding executives={toExecutiveRoster(executiveTerms)} />
  {/await}
{/if}

<style>
  .dashboard-paper {
    width: min(100%, 1040px);
  }
  .dashboard-paper {
    font-family: var(--font-ui);
  }
  .dashboard-heading {
    border-top: 2px solid var(--latex-rule);
    border-bottom: 1px solid var(--latex-rule);
    padding: 1rem 0 1.2rem;
  }
  .home-kicker {
    margin: 0 0 0.35rem;
    color: var(--latex-muted);
    font-size: 0.75rem;
    font-weight: 650;
  }
  h1 {
    margin: 0;
    font: 550 2.2rem/1.4 var(--font-display);
  }
  .member-identity {
    font-size: 0.9rem;
    margin: 0.6rem 0;
  }
  .member-identity span {
    color: var(--latex-muted);
  }
  .home-intro {
    margin: 0;
    color: var(--latex-muted);
    font-size: 0.87rem;
    line-height: 1.75;
  }
  .home-shortcuts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.2rem;
    margin: 0.7rem 0 1.6rem;
  }
  .home-shortcuts a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--latex-text);
    font-size: 0.84rem;
    text-underline-offset: 0.2em;
  }
  .read-only-note {
    border-left: 2px solid var(--latex-rule);
    padding: 0.7rem 0.8rem;
    color: var(--latex-muted);
    font-size: 0.84rem;
    line-height: 1.7;
  }
  .read-only-note a {
    color: var(--latex-text);
  }
  .dashboard-error {
    font-family: var(--font-ui);
  }
  .dashboard-error p {
    color: var(--latex-muted);
    font-size: 0.9rem;
    line-height: 1.75;
  }
  .dashboard-error > a {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    margin-right: 1rem;
  }
  .generated-at {
    margin: 0.7rem 0 0;
    color: var(--latex-muted);
    font: 0.58rem/1.3 var(--font-mono);
    text-align: right;
  }
</style>
