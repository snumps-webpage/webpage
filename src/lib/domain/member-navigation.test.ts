import { describe, expect, it } from "vitest";
import {
  memberNavigation,
  navigationCurrent,
  type NavigationContext,
} from "./member-navigation";
const base: NavigationContext = {
  hasSession: false,
  isMember: false,
  isAdmin: false,
  isWithdrawn: false,
  canViewMemberZone: false,
  canParticipate: false,
  canManageSelf: false,
  hasPresenterEvents: false,
};
const links = (extra: Partial<NavigationContext>) =>
  memberNavigation({ ...base, ...extra });
const member = {
  hasSession: true,
  isMember: true,
  canViewMemberZone: true,
  canParticipate: true,
  canManageSelf: true,
};
describe("existing role navigation matrix", () => {
  it("guest sees existing public paths only", () => {
    const nav = links({});
    expect(nav.memberLinks).toEqual([]);
    expect(nav.adminLinks).toEqual([]);
    expect(nav.publicLinks.map((l) => l.href)).toEqual([
      "/about",
      "/about/executives",
      "/archive",
      "/members",
    ]);
  });
  it("authenticated applicant gets the existing root status redirect, no member-zone actions", () => {
    expect(links({ hasSession: true }).memberLinks).toEqual([
      { label: "가입 신청 상태", href: "/" },
    ]);
  });
  it("registered member has home,study,proposal and account paths", () => {
    expect(links(member).memberLinks.map((l) => l.href)).toEqual([
      "/",
      "/study",
      "/seminar/apply",
      "/settings/notifications",
    ]);
  });
  it("readonly alumni keep readable destinations without proposal writes", () => {
    expect(
      links({ ...member, canParticipate: false }).memberLinks.map(
        (l) => l.href,
      ),
    ).toEqual(["/", "/study", "/settings/notifications", "/signup"]);
  });
  it("unregistered nonalumnus can use root own data and registration only", () => {
    expect(
      links({ hasSession: true, isMember: true }).memberLinks.map(
        (l) => l.href,
      ),
    ).toEqual(["/", "/signup"]);
  });
  it.each([false, true])(
    "presenter read link remains available with participate=%s",
    (canParticipate) => {
      const nav = links({
        ...member,
        canParticipate,
        hasPresenterEvents: true,
      });
      expect(nav.memberLinks.some((l) => l.href === "/events/manage")).toBe(
        true,
      );
    },
  );
  it("presenter flag without member-zone access never grants a link", () => {
    expect(
      links({
        hasSession: true,
        isMember: true,
        hasPresenterEvents: true,
      }).memberLinks.some((l) => l.href === "/events/manage"),
    ).toBe(false);
  });
  it("organizer destinations remain per-study, not invented global roles", () => {
    expect(
      links(member).memberLinks.some((l) => l.href.includes("/manage")),
    ).toBe(false);
  });
  it("admin authority is independent of registration and withdrawn status", () => {
    for (const isWithdrawn of [false, true]) {
      const nav = links({
        hasSession: true,
        isMember: !isWithdrawn,
        isAdmin: true,
        isWithdrawn,
      });
      expect(nav.adminLinks.map((l) => l.href)).toContain("/admin");
      expect(nav.memberLinks.some((l) => l.href === "/seminar/apply")).toBe(
        false,
      );
    }
  });
  it("withdrawn member uses only withdrawal state in member group", () => {
    expect(links({ ...member, isWithdrawn: true }).memberLinks).toEqual([
      { label: "탈퇴 신청 상태", href: "/withdraw/pending" },
    ]);
  });
  it("missing auth cannot expose member or admin links from stale flags", () => {
    const nav = links({ ...member, hasSession: false, isAdmin: true });
    expect(nav.memberLinks).toEqual([]);
    expect(nav.adminLinks).toEqual([]);
  });
  it("active markers match sections without home claiming every page", () => {
    expect(navigationCurrent("/", "/study")).toBe(false);
    expect(navigationCurrent("/study", "/study/id/manage")).toBe(true);
    expect(navigationCurrent("/study", "/study-fake")).toBe(false);
    expect(navigationCurrent("/seminar/apply", "/seminar/edit/id")).toBe(true);
  });
  it("only the most specific visible link is marked current", () => {
    const nav = links({});
    expect(
      navigationCurrent("/about", "/about/executives", nav.publicLinks),
    ).toBe(false);
    expect(
      navigationCurrent(
        "/about/executives",
        "/about/executives",
        nav.publicLinks,
      ),
    ).toBe(true);
  });
});
