/**
 * Centralized constants for Notion property names and activity types.
 */

// Helper to ensure Korean characters are in the standard NFC format
const n = (s: string) => s.normalize("NFC");

export const NOTION_PROPS = {
  NAME: n("이름"),
  EMAIL: n("이메일"),
  PHONE: n("전화번호"),
  PHONE_APP: n("전화 번호"),
  DEPT: n("학과"),
  BACKGROUND: n("배경 지식"),
  JOIN_DATE: n("가입일"),
  EXECUTIVES: n("임원"),
  ATTENDANCE: n("출석"),
  ACTIVITY_NAME: n("활동명"),
  ACTIVITY_DATE: n("일정"),
  ACTIVITY_TYPE: n("활동 종류"),
  // Relation Props
  MEMBER_TO_PRIVATE: n("개인 정보"), // In Member DB
  PRIVATE_TO_MEMBER: n("회원 정보"), // In Private Info DB
  // Seminar Props
  SEMINAR_TITLE: n("제목"),
  SEMINAR_SPEAKER: n("진행자"),
  SEMINAR_SEMESTER: n("학기"),
  SEMINAR_REMARKS: n("비고"),
  SEMINAR_FILES: n("강의 자료"),
  SEMINAR_PHOTOS: n("활동 사진"),
  // Seminar Request Props
  SEMINAR_REQ_TITLE: n("제목"),
  SEMINAR_REQ_SPEAKERS: n("진행자"),
  SEMINAR_REQ_DESC: n("설명"),
  SEMINAR_REQ_PREREQ: n("선수 지식"),
  SEMINAR_REQ_DURATION: n("예상 소요 시간"),
  SEMINAR_REQ_APPROVED: n("승인됨"),
  APP_ACCEPTED: n("수락됨"),
  // Event Props
  EVENT_TITLE: n("Title"),
  EVENT_DATE: n("Date"),
  EVENT_TYPE: n("Type"),
  EVENT_STATUS: n("Status"),
  EVENT_PATH_ID: n("PathId"),
  EVENT_ATTEND_CODE: n("AttendCode"),
  EVENT_NOTION_PAGE_ID: n("NotionPageId"),
};

export const ACTIVITY_TYPES = [
  n("문제 창작"),
  n("문제 풀이"),
  n("회식"),
  n("세미나"),
  n("스터디"),
  n("회의"),
  n("기타"),
];

// Chatroom configuration for welcome emails
export const CHATROOM_LINK = "https://chat.placeholder.link";
export const CHATROOM_PASSWORD = "snumps";
