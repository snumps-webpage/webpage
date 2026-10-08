import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compile } from "svelte/compiler";
import { createAttendanceSubmissionGate } from "$lib/client/attendance-submission";
import {
  dashboardActivityActionPath,
  dashboardActivityNativeNotice,
  dashboardActivityStateLabel,
  mergeDashboardActivityResult,
  type DashboardActivityItem,
} from "$lib/domain/dashboard";

afterEach(() => vi.useRealTimers());

function activity(
  overrides: Partial<DashboardActivityItem> = {},
): DashboardActivityItem {
  return {
    id: "activity-1",
    title: "정수론 세미나",
    type: "세미나",
    startsAt: "2026-10-04T18:30:00+09:00",
    semester: "26-2",
    detailUrl: null,
    eventId: "event-1",
    isApplied: false,
    canApply: true,
    pendingAttendance: false,
    attended: false,
    ...overrides,
  };
}
const target = {
  eventId: "event-1",
  semester: "26-2",
  action: "applyActivity",
} as const;
const applied = (overrides: Partial<DashboardActivityItem> = {}) => ({
  success: true as const,
  operation: "activityApplied" as const,
  activity: activity({ isApplied: true, ...overrides }),
});

describe("ledger response reconciliation", () => {
  it("replaces only the returned row without mutating the loaded snapshot", () => {
    const other = activity({ id: "activity-2", eventId: "event-2" });
    const original = [activity(), other];
    const result = applied({ pendingAttendance: true, canApply: false });
    const merged = mergeDashboardActivityResult(original, result, target);
    expect(merged?.[0]).toEqual(result.activity);
    expect(merged?.[1]).toBe(other);
    expect(original[0].isApplied).toBe(false);
    expect(merged).not.toBe(original);
  });

  it("keeps the server's complete cancellation state, including attendance", () => {
    const returned = activity({
      isApplied: false,
      attended: true,
      canApply: false,
    });
    expect(
      mergeDashboardActivityResult(
        [activity({ isApplied: true })],
        {
          success: true,
          operation: "activityCancelled",
          activity: returned,
        },
        { ...target, action: "cancelActivity" },
      )?.[0],
    ).toEqual(returned);
  });

  it.each([
    { id: "another-activity" },
    { eventId: "another-event" },
    { semester: "26-1" },
  ])("rejects a different response target: %j", (overrides) => {
    expect(
      mergeDashboardActivityResult([activity()], applied(overrides), target),
    ).toBeNull();
  });

  it("rejects another operation or a row no longer in the current view", () => {
    expect(
      mergeDashboardActivityResult(
        [activity()],
        {
          ...applied(),
          operation: "activityCancelled",
        },
        target,
      ),
    ).toBeNull();
    expect(mergeDashboardActivityResult([], applied(), target)).toBeNull();
  });

  it.each([
    null,
    undefined,
    {},
    {
      success: true,
      operation: "profileUpdated",
      profile: { phone: "", background: "" },
    },
    { success: true, operation: "activityApplied" },
    { ...applied(), activity: { ...activity(), isApplied: "true" } },
    { ...applied(), activity: { ...activity(), startsAt: "invalid" } },
    { ...applied(), activity: { ...activity(), type: "unknown" } },
  ])("ignores malformed or unrelated results: %j", (value) => {
    expect(
      mergeDashboardActivityResult([activity()], value, target),
    ).toBeNull();
  });

  it.each([
    "id",
    "title",
    "type",
    "startsAt",
    "semester",
    "detailUrl",
    "eventId",
    "isApplied",
    "canApply",
    "pendingAttendance",
    "attended",
  ])("requires the existing complete row field %s", (field) => {
    const incomplete = { ...applied().activity } as Record<string, unknown>;
    delete incomplete[field];
    expect(
      mergeDashboardActivityResult(
        [activity()],
        { ...applied(), activity: incomplete },
        target,
      ),
    ).toBeNull();
  });
});

describe("operation-scoped native POST feedback", () => {
  it("shows matching apply/cancel acknowledgement only in its semester", () => {
    expect(
      dashboardActivityNativeNotice(applied(), "applyActivity", "26-2"),
    ).toEqual({
      tone: "success",
      message: "활동 참여를 신청했습니다.",
    });
    expect(
      dashboardActivityNativeNotice(
        { ...applied(), operation: "activityCancelled" },
        "cancelActivity",
        "26-2",
      ),
    ).toEqual({
      tone: "success",
      message: "활동 참여 신청을 취소했습니다.",
    });
    expect(
      dashboardActivityNativeNotice(applied(), "cancelActivity", "26-2"),
    ).toBeNull();
    expect(
      dashboardActivityNativeNotice(applied(), "applyActivity", "26-1"),
    ).toBeNull();
    expect(dashboardActivityNativeNotice(applied(), null, "26-2")).toBeNull();
  });

  it("scopes failure codes to an activity action, excluding other home operations", () => {
    const failed = { error: "UNAUTHORIZED" };
    expect(
      dashboardActivityNativeNotice(failed, "applyActivity", "26-2"),
    ).toMatchObject({
      tone: "error",
      message: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
    });
    expect(dashboardActivityNativeNotice(failed, null, "26-2")).toBeNull();
    expect(
      dashboardActivityNativeNotice(
        {
          success: true,
          operation: "profileUpdated",
          profile: { phone: "", background: "" },
        },
        "applyActivity",
        "26-2",
      ),
    ).toBeNull();
    expect(
      dashboardActivityNativeNotice({ success: true }, "applyActivity", "26-2"),
    ).toBeNull();
    expect(
      dashboardActivityNativeNotice({ error: {} }, "applyActivity", "26-2"),
    ).toBeNull();
  });

  it.each(["applyActivity", "cancelActivity"] as const)(
    "retains the semester on native %s POST",
    (action) => {
      const url = new URL(
        dashboardActivityActionPath(action, "26-2 & 한글"),
        "http://localhost/",
      );
      expect(url.searchParams.get("semester")).toBe("26-2 & 한글");
      expect(url.searchParams.has(`/${action}`)).toBe(true);
    },
  );
});

describe("ledger state wording", () => {
  it("describes missing records without claiming absence or queue approval", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    expect(
      dashboardActivityStateLabel(
        activity({ isApplied: true, pendingAttendance: true, canApply: false }),
      ),
    ).toBe("출석 기록 확인");
    expect(
      dashboardActivityStateLabel(
        activity({ startsAt: "2026-09-03T18:30:00+09:00", canApply: false }),
      ),
    ).toBe("출석 기록 없음");
    expect(
      dashboardActivityStateLabel(
        activity({ attended: true, pendingAttendance: true }),
      ),
    ).toBe("출석 기록 있음");
  });
});

const componentSource = readFileSync(
  "src/lib/components/dashboard/DashboardActivityLedger.svelte",
  "utf8",
);

describe("ledger source and compiler checks, not browser verification", () => {
  it.each(["client", "server"] as const)(
    "compiles the %s component without warnings",
    (generate) => {
      const result = compile(componentSource, {
        filename: "src/lib/components/dashboard/DashboardActivityLedger.svelte",
        generate,
      });
      expect(result.warnings).toEqual([]);
    },
  );

  it("keeps one semantic table, §03, filters and the native form contract", () => {
    expect(componentSource).toContain('id="home-activities"');
    expect(componentSource).toContain("§ 03");
    expect(componentSource.match(/<table\b/g)).toHaveLength(1);
    expect(componentSource).toContain('scope="col"');
    expect(componentSource).toContain('scope="row"');
    expect(componentSource).toContain('name="eventId"');
    expect(componentSource).toContain("value={activity.eventId}");
    expect(componentSource).toContain(
      "dashboardActivityActionPath(action, selectedSemester)",
    );
    expect(componentSource).toContain("bind:value={typeFilter}");
    expect(componentSource).toContain("onchange={switchSemester}");
    expect(componentSource).toContain(
      "dashboardActivityNativeNotice(form, nativeAction, selectedSemester)",
    );
  });

  it("labels the loaded scope and preserves a table empty state", () => {
    expect(componentSource).toContain(
      "이번 학기 회원에게 공개된 활동을 모두 표시합니다",
    );
    expect(componentSource).toContain(
      "지난 학기는 내가 출석한 활동만 표시합니다",
    );
    expect(componentSource).toContain(
      "이 학기에 기록된 내 출석 활동이 없습니다",
    );
    expect(componentSource).toContain('colspan="5"');
    expect(componentSource).toContain(
      "출석 요청·승인 여부는 이 목록에서 확인할 수 없습니다",
    );
    expect(componentSource.replace(/\s+/g, " ")).toContain(
      "‘출석 기록 없음’은 실제 불참을 뜻하지 않습니다",
    );
  });
});

describe("ledger interrupted submission safeguards", () => {
  it("drops an old response after leaving and returning to the same semester", () => {
    const gate = createAttendanceSubmissionGate();
    const ticket = gate.begin("/|26-2");
    let rows = [activity()];
    gate.invalidate();
    gate.invalidate();
    if (gate.current(ticket, "/|26-2"))
      rows = mergeDashboardActivityResult(rows, applied(), target)!;
    expect(rows[0].isApplied).toBe(false);
  });

  it("only the latest submission can reconcile and release busy state", async () => {
    const gate = createAttendanceSubmissionGate();
    const old = gate.begin("/|26-2");
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let rows = [activity()];
    let busy = true;
    const lateResponse = (async () => {
      await wait;
      if (!gate.current(old, "/|26-2")) return;
      rows = mergeDashboardActivityResult(rows, applied(), target)!;
      busy = false;
    })();
    const latest = gate.begin("/|26-2");
    release();
    await lateResponse;
    expect(rows[0].isApplied).toBe(false);
    expect(busy).toBe(true);
    expect(gate.current(latest, "/|26-2")).toBe(true);
  });

  it("wires navigation invalidation, redirect update and finally cleanup in the component", () => {
    const source = readFileSync(
      "src/lib/components/dashboard/DashboardActivityLedger.svelte",
      "utf8",
    );
    expect(source).toContain("beforeNavigate(abandonSubmission)");
    expect(source).toContain("onDestroy(() => submissions.invalidate())");
    expect(source).toContain("submissions.current(ticket, ledgerScope)");
    expect(source).toContain('result.type === "redirect"');
    expect(source).toContain("await update({ reset: false })");
    expect(source).toContain("finally {");
    expect(source).toContain("ownsResponse() && processingEventId === eventId");
    expect(source).toContain("disabled={ledgerBusy}");
    expect(source).toContain(
      "incoming.every((item, index) => item === sourceActivities[index])",
    );
  });
});
