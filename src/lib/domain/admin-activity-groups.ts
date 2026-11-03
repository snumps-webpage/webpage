/** Read-only view model: a study is a container, never an attendance activity. */
export type ActivityGroupStudy = {
  id: string;
  title: string;
  semester: string;
  participantCount: number;
};
type Searchable = { title: string; type?: string; date: { start: string } };
type GroupActivity = Searchable & { id: string; studyId: string | null };
type GroupEvent = Searchable & {
  id: string;
  studyId: string | null;
  activityId: string;
  sessionNo: number | null;
  status: string;
};
export type StudyActivityGroup<
  A extends GroupActivity,
  E extends GroupEvent,
> = {
  study: ActivityGroupStudy;
  sessions: { event: E; activity: A | null }[];
  linkedActivities: A[];
};

export function groupStudyActivities<
  A extends GroupActivity,
  E extends GroupEvent,
>(
  studies: readonly ActivityGroupStudy[],
  activities: readonly A[],
  events: readonly E[],
) {
  const studyGroups: StudyActivityGroup<A, E>[] = studies.map((study) => ({
    study,
    sessions: [],
    linkedActivities: [],
  }));
  const byStudy = new Map(studyGroups.map((group) => [group.study.id, group]));
  const byActivity = new Map(
    activities.map((activity) => [activity.id, activity]),
  );
  const assigned = new Set<string>();
  for (const event of events) {
    const group = event.studyId ? byStudy.get(event.studyId) : undefined;
    if (!group) continue;
    // A stale activity.studyId cannot move a real session to another study.
    // In corrupt duplicate-event data, retain all events but edit each activity once.
    const activity = assigned.has(event.activityId)
      ? null
      : (byActivity.get(event.activityId) ?? null);
    group.sessions.push({ event, activity });
    if (activity) assigned.add(activity.id);
  }
  const ungroupedActivities: A[] = [];
  for (const activity of activities) {
    if (assigned.has(activity.id)) continue;
    const group = activity.studyId ? byStudy.get(activity.studyId) : undefined;
    if (group) group.linkedActivities.push(activity);
    else ungroupedActivities.push(activity);
  }
  for (const group of studyGroups) {
    group.sessions.sort(
      (a, b) =>
        (a.event.sessionNo ?? Number.MAX_SAFE_INTEGER) -
          (b.event.sessionNo ?? Number.MAX_SAFE_INTEGER) ||
        a.event.date.start.localeCompare(b.event.date.start),
    );
  }
  return { studyGroups, ungroupedActivities };
}

export function matchesActivitySearch(activity: Searchable, query: string) {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  return (
    !normalized ||
    [
      activity.title,
      activity.type ?? "",
      activity.date.start.slice(0, 10),
    ].some((value) => value.toLocaleLowerCase("ko-KR").includes(normalized))
  );
}

export function filterStudyActivityGroups<
  A extends GroupActivity,
  E extends GroupEvent,
>(
  groups: readonly StudyActivityGroup<A, E>[],
  query: string,
): StudyActivityGroup<A, E>[] {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  return groups.flatMap((group) => {
    if (
      !normalized ||
      [group.study.title, group.study.semester].some((value) =>
        value.toLocaleLowerCase("ko-KR").includes(normalized),
      )
    )
      return [group];
    const sessions = group.sessions.filter(
      (session) =>
        matchesActivitySearch(session.event, query) ||
        (session.activity && matchesActivitySearch(session.activity, query)),
    );
    const linkedActivities = group.linkedActivities.filter((activity) =>
      matchesActivitySearch(activity, query),
    );
    return sessions.length || linkedActivities.length
      ? [{ ...group, sessions, linkedActivities }]
      : [];
  });
}
