# Notion Database Schema Reference

This document outlines the expected property structure for the Notion databases used in SNUMPS Automation.

## 1. Members DB (`NOTION_DB_MEMBERS`)

**Purpose:** Stores public member information and serves as the primary identity record.

| Property Name | Type        | Description                                       |
| :------------ | :---------- | :------------------------------------------------ |
| **이름**      | Title       | Member's full name.                               |
| **학과**      | RichText    | Member's academic department.                     |
| **가입일**    | Date        | Date when the member joined the club.             |
| **개인 정보** | Relation    | Link to the _Private Info_ database (1:1).        |
| **임원**      | MultiSelect | Roles like "25-2 회 장" for identifying officers. |
| **활동 기록** | Relation    | Link to the _Activities_ database (Multiple).     |

## 2. Private Info DB (`NOTION_DB_PRIVATE_INFO`)

**Purpose:** Stores sensitive or detailed member information. Linked 1:1 with Members DB.

| Property Name | Type        | Description                              |
| :------------ | :---------- | :--------------------------------------- |
| **이름**      | Title       | Member's full name (matches Members DB). |
| **이메일**    | Email       | Unique identifier for lookup.            |
| **전화번호**  | PhoneNumber | Contact number.                          |
| **배경 지식** | RichText    | Academic background or skills.           |
| **회원 정보** | Relation    | Link back to the _Members_ database.     |

## 3. Activities DB (`NOTION_DB_ACTIVITIES`)

**Purpose:** Stores official club events and attendance records.

| Property Name | Type     | Description                                          |
| :------------ | :------- | :--------------------------------------------------- |
| **활동명**    | Title    | Name of the event.                                   |
| **일정**      | Date     | Date and time of the event.                          |
| **활동 종류** | Select   | Category (e.g., "세미나", "스터디", "회의", "회식"). |
| **출석**      | Relation | Link to _Members_ database (Attendees).              |

## 4. Applications DB (`NOTION_DB_APPLICATIONS`)

**Purpose:** Stores new membership applications before approval.

| Property Name | Type        | Description                     |
| :------------ | :---------- | :------------------------------ |
| **이름**      | Title       | Applicant's name.               |
| **이메일**    | Email       | Applicant's email.              |
| **전화 번호** | PhoneNumber | Applicant's phone number.       |
| **학과**      | RichText    | Applicant's department.         |
| **배경 지식** | RichText    | Applicant's background info.    |
| **수락됨**    | Checkbox    | Toggled by admin upon approval. |

## 5. Seminar Requests DB (`NOTION_DB_SEMINAR_REQUESTS`)

**Purpose:** Stores member-submitted seminar proposals.

| Property Name      | Type     | Description                            |
| :----------------- | :------- | :------------------------------------- |
| **제목**           | Title    | Seminar topic/title.                   |
| **설명**           | RichText | Detailed description of the seminar.   |
| **선수 지식**      | RichText | Required background knowledge.         |
| **예상 소요 시간** | RichText | Proposed duration.                     |
| **진행자**         | Relation | Link to _Members_ database (Speakers). |
| **승인됨**         | Checkbox | Toggled by admin upon approval.        |

## 6. Attendance Queue DB (`NOTION_DB_ATTENDANCE_QUEUE`)

**Purpose:** Stores temporary attendance records pending admin approval.

| Property Name | Type     | Description                        |
| :------------ | :------- | :--------------------------------- |
| **UserName**  | Title    | Name of the user checking in.      |
| **UserEmail** | Email    | Email of the user.                 |
| **UserDept**  | RichText | Department of the user.            |
| **EventId**   | RichText | ID of the target event.            |
| **StartTime** | Date     | Check-in timestamp.                |
| **EndTime**   | Date     | Check-out timestamp.               |
| **Status**    | Select   | `pending`, `approved`, `rejected`. |
