import { z } from "zod";

/**
 * Zod schemas for Notion-originated data.
 * Ensures strict typing and validation across the server layer.
 */

export const MemberSchema = z.object({
  id: z.string(), // This is the Notion Page ID in Members DB
  memberId: z.string(), // Alias for 'id' to maintain compatibility
  name: z.string(),
  department: z.string(),
  joinDate: z.string().optional(),
  privateInfoId: z.string(),
});

export type Member = z.infer<typeof MemberSchema>;

export const PrivateInfoSchema = z.object({
  id: z.string().optional(),
  email: z.string().email(),
  name: z.string(),
  phone: z.string(),
  background: z.string().optional(),
  memberId: z.string().optional(),
});

export type PrivateInfo = z.infer<typeof PrivateInfoSchema>;

export const ApplicationSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  phone: z.string(),
  department: z.string(),
  background: z.string(),
  accepted: z.boolean(),
  submittedAt: z.string(),
});

export type Application = z.infer<typeof ApplicationSchema>;

export const ActivitySchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  type: z.string(),
  attendees: z.array(z.string()).optional(),
  url: z.string().optional(),
});

export type Activity = z.infer<typeof ActivitySchema>;

export const SeminarSchema = z.object({
  id: z.string(),
  title: z.string(),
  remarks: z.string().optional(),
  semester: z.string(),
  speakerIds: z.array(z.string()).optional(),
});

export type Seminar = z.infer<typeof SeminarSchema>;

export const SeminarRequestSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  prerequisites: z.string(),
  duration: z.string(),
  speakerIds: z.array(z.string()),
  attachment: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected"]),
  submittedAt: z.string(),
});

export type SeminarRequest = z.infer<typeof SeminarRequestSchema>;

export const EventSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string().optional(),
  type: z.string(),
  status: z.string(),
  pathId: z.string(),
  attendCode: z.string(),
  notionPageId: z.string().optional(),
});

export type Event = z.infer<typeof EventSchema>;

export interface ExecutiveInfo {
  name: string;
  phone: string;
}

export interface LatestExecutives {
  president: ExecutiveInfo;
  vicePresident: ExecutiveInfo;
}
