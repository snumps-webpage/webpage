<script lang="ts">
  import { page } from "$app/state";
  import DashboardActivityLedger from "$lib/components/dashboard/DashboardActivityLedger.svelte";
  import DashboardProfilePanel from "$lib/components/dashboard/DashboardProfilePanel.svelte";
  import DashboardWorkSummary from "$lib/components/dashboard/DashboardWorkSummary.svelte";
  import GuestLanding from "$lib/components/dashboard/GuestLanding.svelte";
  import { toExecutiveRoster } from "$lib/domain/executive-roster";
  import ManuscriptHeader from "$lib/components/ManuscriptHeader.svelte";
  import { MANUSCRIPT } from "$lib/constants";

  let { data } = $props();
  const session = $derived(page.data.session);
</script>

<svelte:head>
  <title>{session?.user ? "활동 현황 · SNUMPS" : "서울대학교 수학문제연구회 SNUMPS"}</title>
</svelte:head>

{#if session?.user}
  {#await data.streamed.dashboard then dashboard}
    {#if dashboard && !("error" in dashboard)}
      {@const requestedSemester = page.url.searchParams.get("semester")}
      {@const selectedSemester =
        requestedSemester && dashboard.semesters.includes(requestedSemester)
          ? requestedSemester
          : data.currentSemesterKey}
      {@const activities = dashboard.activities
        .filter((activity) => activity.semester === selectedSemester)
        .map((activity) => ({
          id: activity.id,
          title: activity.name,
          type: activity.type,
          startsAt: activity.date,
          semester: activity.semester,
          detailUrl: activity.url || null,
          eventId: activity.eventId,
          isApplied: activity.isApplied,
          canApply: activity.canApply,
          pendingAttendance: activity.pendingAttendance,
          attended: activity.attended,
        }))}
      {@const requests = dashboard.seminarRequests.map((request) => ({
        id: request.id,
        type: "seminar" as const,
        title: request.title,
        status: request.status,
        submittedAt: request.submittedAt,
        actionPath: null,
      }))}
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
        <div class="dashboard-heading">
          <ManuscriptHeader
            title="활동 현황"
            subtitle={`Issue ${selectedSemester}`}
            figure={MANUSCRIPT.FIGURES.DASHBOARD}
          />
          <div class="member-index">
            <span>Member</span>
            <strong>{dashboard.profile.name}</strong>
            <span>{dashboard.profile.department}</span>
          </div>
        </div>

        <DashboardWorkSummary {requests} {studies} {pendingTransfer} />

        <DashboardProfilePanel initialProfile={dashboard.profile} />

        {#key selectedSemester}
          <DashboardActivityLedger
            initialActivities={activities}
            semesters={dashboard.semesters}
            {selectedSemester}
          />
        {/key}

        <p class="generated-at">데이터 기준 {new Date(dashboard.generatedAt).toLocaleString("ko-KR")}</p>
      </article>
    {:else}
      {#await page.data.executives then executiveTerms}
        <GuestLanding executives={toExecutiveRoster(executiveTerms)} />
      {/await}
    {/if}
  {/await}
{:else}
  {#await page.data.executives then executiveTerms}
    <GuestLanding executives={toExecutiveRoster(executiveTerms)} />
  {/await}
{/if}

<style>
  .dashboard-paper { width: min(100%, 1040px); }
  .dashboard-heading { position: relative; }
  .member-index { position: absolute; top: 0; right: 0; display: grid; grid-template-columns: auto auto; gap: 0.18rem 0.55rem; align-items: baseline; padding: 0.55rem 0.65rem; border: 1px solid var(--latex-rule); }
  .member-index > span { color: var(--latex-muted); font: 700 0.55rem/1.2 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; }
  .member-index > span:last-child { grid-column: 1 / -1; text-align: right; text-transform: none; }
  .member-index strong { font-size: 0.72rem; }
  .generated-at { margin: 0.7rem 0 0; color: var(--latex-muted); font: 0.58rem/1.3 var(--font-mono); text-align: right; }
  @media (max-width: 700px) {
    .member-index { position: static; grid-template-columns: auto 1fr auto; margin: -1rem 0 1rem; }
    .member-index > span:last-child { grid-column: auto; text-align: right; }
  }
</style>
