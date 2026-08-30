export const ACTIVITY_TYPES = [
  "문제 창작",
  "문제 풀이",
  "회식",
  "세미나",
  "스터디",
  "회의",
  "기타",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// Chatroom configuration for welcome emails
export const CHATROOM_NOTICE_LINK = "https://invite.kakao.com/tc/0PrN2Zk2VZ";
export const CHATROOM_CHAT_LINK = "https://invite.kakao.com/tc/tGxjs2oKOV";

// Academic Manuscript Branding
export const MANUSCRIPT = {
  FOUNDATION_DATE: "29 NOV 2024",
  JOURNAL_TITLE: "SNUMPS Webpage",
  FIGURES: {
    DASHBOARD: "Figure D-1 · Member Dashboard Overview",
    SIGNUP: "Figure S-1 · Membership Application Draft",
    REVISION: "Figure S-2 · Revision Manuscript",
    SEMINAR_APPLY: "Figure P-1 · Seminar Proposal Form",
    SEMINAR_EDIT: "Figure P-2 · Proposal Revision Draft",
    ADMIN: "Figure A-1 · Administrative Control Panel",
    ADMIN_SEMINARS: "Figure A-2 · Seminar Publication Workflow",
    ADMIN_STUDIES: "Figure A-3 · Study Proposal Review Queue",
    ADMIN_MEMBERS: "Figure A-4 · Member and Role Index",
    ADMIN_MEMBER_DETAIL: "Figure A-5 · Member Authority Record",
    ADMIN_ACTIVITIES: "Table A-6 · Activity Record Editor",
    ADMIN_GALLERY: "Figure A-7 · Gallery Record Editor",
    PUBLIC_MEMBERS: "Table P-1 · Public Member Register",
    PUBLIC_EXECUTIVES: "Figure P-2 · Executive History",
    ABOUT_INDEX: "Figure P-3 · Public Document Directory",
    CHARTER: "Document P-4 · Current Charter",
    ELECTIONS: "Document P-5 · Election Archive",
    PRESS: "Document P-6 · Publicity Materials",
    FINANCE: "Document P-7 · Finance Reference",
    ARCHIVE_INDEX: "Figure R-0 · Activity Archive Directory",
    ARCHIVE_SEMINARS: "Table R-1 · Seminar Archive",
    ARCHIVE_STUDIES: "Table R-2 · Study Archive",
    ARCHIVE_ACTIVITIES: "Table R-3 · Public Activity Ledger",
    ARCHIVE_GALLERY: "Figure R-4 · Activity Gallery",
    ARCHIVE_PROJECTS: "Table R-5 · Member Project Index",
    ARCHIVE_MISC: "Document R-6 · Miscellaneous Records",
    STUDY_INDEX: "Figure T-0 · Study Index",
    STUDY_APPLY: "Figure T-A · Study Proposal Form",
    STUDY_DETAIL: "Figure T-D · Study Enrollment Sheet",
    STUDY_MANAGE: "Figure T-1 · Study Session Ledger",
    STUDY_ATTENDANCE: "Figure T-2 · Session Attendance Register",
    EVENT_NEW: "Figure A-New · Event Draft",
    EVENT_CONNECT: "Figure A-Connect · Existing Activity Index",
    WAIT: "Figure W-1 · Queue Status Notice",
    ATTENDANCE: "Figure E-1 · Attendance Submission Sheet",
    PRESENTER_ATTENDANCE: "Figure E-2 · Presenter Attendance Register",
    LOGIN: "Figure A-0 · Authentication Gateway",
    NOTIFICATIONS: "Figure M-6 · Announcement Preference",
    WITHDRAWAL: "Figure M-7 · Membership Withdrawal Protocol",
    WITHDRAWAL_PENDING: "Figure M-8 · Withdrawal Grace Period",
  },
};
