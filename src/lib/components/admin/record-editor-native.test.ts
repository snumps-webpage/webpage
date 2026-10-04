// @vitest-environment node
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type {
  AdminSeminarRecord,
  AdminStudyRecord,
} from "$lib/domain/admin-records";
import SeminarEditor from "./AdminSeminarRecordEditor.svelte";
import StudyEditor from "./AdminStudyRecordEditor.svelte";
import type { AdminRecordActionState } from "$lib/domain/admin-record-editor";

const members = [
  { id: "m1", name: "예시 첫 회원", department: "수리과학부" },
  { id: "m2", name: "예시 둘째 회원", department: "수학교육과" },
];
const seminar: AdminSeminarRecord = {
  id: "s1",
  sourceRequestId: null,
  kind: "regular",
  title: "예시 세미나",
  term: "26-2",
  description: "SAVED_PUBLIC_DESCRIPTION",
  note: "SAVED_NOTE",
  prerequisites: "해석학",
  durationMinutes: 60,
  preferredTiming: "",
  presenterIds: ["m1", "m2", "legacy1"],
  presenterNames: ["예시 첫 회원", "예시 둘째 회원", "예시 기존 발표자"],
  scheduledAt: null,
  endsAt: null,
  location: null,
  activityId: "a1",
  eventId: "e1",
  files: [],
};
const study: AdminStudyRecord = {
  id: "study1",
  sourceRequestId: null,
  title: "예시 스터디",
  term: "26-2",
  description: "SAVED_STUDY_DESCRIPTION",
  material: "SAVED_MATERIAL",
  organizerIds: ["m1"],
  organizerNames: ["예시 첫 회원"],
  pendingTransfer: null,
  transferHistory: [],
  sessionCount: 0,
  files: [],
};
const seminarHtml = (form: AdminRecordActionState | null = null) =>
  render(SeminarEditor, {
    props: { records: [seminar], members, currentTerm: "26-2", form },
  }).body;
const studyHtml = (form: AdminRecordActionState | null = null) =>
  render(StudyEditor, {
    props: { records: [study], members, currentTerm: "26-2", form },
  }).body;

describe("native record editors", () => {
  it("edits real public introduction and distinct note separately", () => {
    const body = seminarHtml();
    expect(body).toContain('name="description"');
    expect(body).toContain('name="note"');
    expect(body).toContain("SAVED_PUBLIC_DESCRIPTION");
    expect(body).toContain("SAVED_NOTE");
  });
  it("posts repeated presenters and visible legacy choices without JavaScript", () => {
    const body = seminarHtml();
    expect(body).toMatch(/type="hidden" name="presenterIds" value=""/);
    expect(body).toMatch(/name="presenterIds" value="legacy1" checked/);
    expect(body).toContain("운영 명단 외");
  });
  it("restores empty public introduction and only target record raw fields on failure", () => {
    const body = seminarHtml({
      scope: "record-update",
      id: "s1",
      error: "VALIDATION_FAILED",
      issues: { title: "제목 필요" },
      values: {
        title: "  ",
        term: "bad term",
        description: "",
        note: "  raw memo  ",
      },
      presenterIds: [],
    });
    expect(body).toMatch(/name="title" value=" {2}"/);
    expect(body).toContain("bad term");
    expect(body).not.toContain("SAVED_PUBLIC_DESCRIPTION");
    expect(body).toContain("  raw memo  ");
    expect(body).not.toMatch(/name="presenterIds" value="m1" checked/);
    expect(body).toMatch(/<details[^>]*class="record-card [^"]*"[^>]*open/);
  });
  it("keeps another record's draft out of this editor", () => {
    const body = seminarHtml({
      scope: "record-update",
      id: "other",
      error: "VALIDATION_FAILED",
      values: { title: "OTHER_DRAFT" },
      presenterIds: [],
    });
    expect(body).not.toContain("OTHER_DRAFT");
    expect(body).toMatch(/name="presenterIds" value="m1" checked/);
  });
  it("offers the existing linked seminar delete action and explains server checks", () => {
    const body = seminarHtml();
    const deleteForm = body.match(
      /<form[^>]*action="\?\/delete"[\s\S]*?<\/form>/,
    )?.[0];
    expect(deleteForm).toBeDefined();
    expect(deleteForm).not.toContain("disabled");
    expect(deleteForm).toContain("활동·출석을 유지");
  });
  it("shows service failure uncertainty instead of dropping all non-CONFLICT errors", () => {
    const body = seminarHtml({
      scope: "record-update",
      id: "s1",
      error: "SERVICE_UNAVAILABLE",
      values: { description: "raw uncertain edit" },
      presenterIds: ["m2"],
    });
    expect(body).toContain('role="alert"');
    expect(body).toContain("상태가 바뀌었을 수");
    expect(body).toContain("raw uncertain edit");
    expect(body).toMatch(/name="presenterIds" value="m2" checked/);
  });
  it("restores study failure text and keeps the target detail open", () => {
    const body = studyHtml({
      scope: "record-update",
      id: "study1",
      error: "VALIDATION_FAILED",
      issues: { title: "제목 필요" },
      values: {
        title: " raw study ",
        term: "bad term",
        description: "",
        material: " raw book ",
      },
    });
    expect(body).toContain(" raw study ");
    expect(body).toContain(" raw book ");
    expect(body).not.toContain("SAVED_STUDY_DESCRIPTION");
    expect(body).toMatch(/<details[^>]*class="record-card [^"]*"[^>]*open/);
  });
});
