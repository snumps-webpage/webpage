export interface NotionActivity {
  id: string;
  name: string;
  date: string;
  type: string;
  url: string;
}

export interface Activity extends NotionActivity {
  attended: boolean;
  semester: string;
  eventId?: string;
  isApplied?: boolean;
  canApply?: boolean;
  pendingAttendance?: boolean;
}

export interface AttendanceStats {
  total: number;
  attended: number;
}

export interface SeminarRequest {
  id: string;
  title: string;
  description: string;
  prerequisites: string;
  duration: string;
  speakerIds: string[];
  attachment?: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
}

export interface DashboardData {
  activities: Activity[];
  myAttendanceStats: AttendanceStats;
  mySeminars?: SeminarRequest[];
  profile: {
    phone: string;
    background?: string;
  };
  semesters: string[];
  error?: string;
}

export interface Event {
  id: string;
  notionPageId?: string;
  title: string;
  date: string;
  type: string;
  status: "draft" | "active" | "expired";
  pathId: string;
  attendCode: string;
  applicantIds?: string[];
  presenterIds?: string[];
}

export interface AttendanceRecord {
  id: string; // Internal/Local ID (often matches Notion ID if synced)
  notionId?: string;
  eventId: string;
  userEmail: string;
  userName: string;
  userDept: string;
  startTime: string;
  endTime?: string;
  status: "pending" | "approved" | "rejected";
}

export interface Member {
  id: string;
  name: string;
  department: string;
  joinDate: string;
}

export interface SeminarSpeaker {
  id: string;
  name: string;
  department: string;
  email: string;
}

export interface NotionRow {
  id: string;
  [key: string]: string;
}
