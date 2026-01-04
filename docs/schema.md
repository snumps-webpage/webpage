# Notion Database Schema Reference

This document outlines the expected property structure for the Notion databases used in SNUMPS Automation.

## 1. Members DB (`NOTION_DB_MEMBERS`)
**Purpose:** Stores public member information and serves as the primary identity record.

| Property Name | Type | Description |
| :--- | :--- | :--- |
| **이름** (Name) | Title | Member's full name. |
| **이메일** (Email) | Email | Member's email address. |
| **전화번호** (Phone) | Phone | Member's contact number. |
| **학과** (Department) | RichText | Member's academic department. |
| **가입일** (Join Date) | Date | Date when the member joined the club. |
| **회원 정보** (Member Info) | Relation | Link to the *Private Info* database (1:1). |
| **임원** (Executives) | MultiSelect | Roles like "25-1 회장" for identifying officers. |

## 2. Private Info DB (`NOTION_DB_PRIVATE_INFO`)
**Purpose:** Stores sensitive or detailed member information. Linked 1:1 with Members DB.

| Property Name | Type | Description |
| :--- | :--- | :--- |
| **이름** (Name) | Title | Member's full name (matches Members DB). |
| **이메일** (Email) | Email | Unique identifier for lookup. |
| **전화번호** (Phone) | Phone | Contact number. |
| **배경 지식** (Background) | RichText | Academic background or skills. |
| **회원 정보** (Member Info) | Relation | Link back to the *Members* database. |

## 3. Activities DB (`NOTION_DB_ACTIVITIES`)
**Purpose:** Stores official club events and attendance records.

| Property Name | Type | Description |
| :--- | :--- | :--- |
| **활동명** (Activity Name) | Title | Name of the event. |
| **일정** (Activity Date) | Date | Date and time of the event (with Timezone). |
| **활동 종류** (Activity Type) | Select | Category (e.g., "세미나", "회의", "회식"). |
| **출석** (Attendance) | Relation | Link to *Members* database (Attendees). |

## 4. Applications DB (`NOTION_DB_APPLICATIONS`)
**Purpose:** Stores new membership applications before approval.

| Property Name | Type | Description |
| :--- | :--- | :--- |
| **Name** | Title | Applicant's name. |
| **Email** | Email | Applicant's email. |
| **Phone** | Phone | Applicant's phone number. |
| **Department** | RichText | Applicant's department. |
| **Background** | RichText | Applicant's background info. |

## 5. Seminar Requests DB (`NOTION_DB_SEMINAR_REQUESTS`)
**Purpose:** Stores member-submitted seminar proposals.

| Property Name | Type | Description |
| :--- | :--- | :--- |
| **Title** | Title | Seminar topic/title. |
| **Date** | Date | Proposed date and time. |
| **ApplicantEmail** | Email | Email of the member applying. |
| **ApplicantName** | RichText | Name of the member applying. |
| **Status** | Select | `pending`, `approved`, `rejected`. |
| **Speakers** | Relation | Link to *Members* database (Speakers). |

## 6. Attendance Queue DB (`NOTION_DB_ATTENDANCE_QUEUE`)
**Purpose:** Stores temporary attendance records pending admin approval.

| Property Name | Type | Description |
| :--- | :--- | :--- |
| **UserName** | Title | Name of the user checking in. |
| **UserEmail** | Email | Email of the user. |
| **UserDept** | RichText | Department of the user. |
| **EventId** | RichText | ID of the target event. |
| **StartTime** | Date | Check-in timestamp. |
| **EndTime** | Date | Check-out timestamp. |
| **Status** | Select | `pending`, `approved`, `rejected`. |
