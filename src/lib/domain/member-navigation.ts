export interface NavigationLink {
  label: string;
  href: string;
  desktop?: boolean;
}
export interface NavigationContext {
  hasSession: boolean;
  isMember: boolean;
  isAdmin: boolean;
  isWithdrawn: boolean;
  canViewMemberZone: boolean;
  canParticipate: boolean;
  canManageSelf: boolean;
  hasPresenterEvents: boolean;
}

/** Link visibility mirrors existing guards; it grants no server authority. */
export function memberNavigation(context: NavigationContext) {
  const publicLinks: NavigationLink[] = [
    { label: "동아리 소개", href: "/about" },
    { label: "역대 회장단", href: "/about/executives", desktop: false },
    { label: "활동 기록", href: "/archive" },
    { label: "회원 명단", href: "/members" },
  ];
  const memberLinks: NavigationLink[] = [];
  if (context.hasSession) {
    if (context.isWithdrawn)
      memberLinks.push({ label: "탈퇴 신청 상태", href: "/withdraw/pending" });
    else if (context.isMember) {
      memberLinks.push({ label: "내 활동", href: "/" });
      if (context.canViewMemberZone)
        memberLinks.push({ label: "스터디", href: "/study" });
      if (context.canParticipate)
        memberLinks.push({ label: "세미나 제안", href: "/seminar/apply" });
      if (context.canViewMemberZone && context.hasPresenterEvents)
        memberLinks.push({
          label: context.canParticipate ? "발표 출석" : "발표 출석 기록",
          href: "/events/manage",
        });
      if (context.canViewMemberZone && context.canManageSelf)
        memberLinks.push({
          label: "회원 설정",
          href: "/settings/notifications",
        });
      if (!context.canParticipate)
        memberLinks.push({ label: "학기 등록", href: "/signup" });
    } else {
      // The existing hybrid home redirects to signup or wait using the real
      // application state. Do not add a private application lookup to the shell.
      memberLinks.push({ label: "가입 신청 상태", href: "/" });
    }
  }
  const adminLinks: NavigationLink[] =
    context.hasSession && context.isAdmin
      ? [
          { label: "운영 관리", href: "/admin" },
          { label: "세미나 운영", href: "/admin/seminars", desktop: false },
          {
            label: "활동 기록 관리",
            href: "/admin/activities",
            desktop: false,
          },
          { label: "갤러리 관리", href: "/admin/gallery", desktop: false },
        ]
      : [];
  return { publicLinks, memberLinks, adminLinks };
}

export function navigationCurrent(
  href: string,
  pathname: string,
  links?: readonly NavigationLink[],
) {
  if (
    links?.some(
      (link) =>
        link.href !== href &&
        link.href.length > href.length &&
        (pathname === link.href || pathname.startsWith(`${link.href}/`)),
    )
  )
    return false;
  if (href === "/") return pathname === "/";
  if (href === "/seminar/apply" && pathname.startsWith("/seminar/edit/"))
    return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}
