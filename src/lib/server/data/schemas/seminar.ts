import { z } from "zod";
import { Id, Semester, SourceRequestId } from "./common";

export const SeminarSchema = z.object({
  id: Id,
  title: z.string().min(1),
  semester: Semester,
  note: z.string(),
  presenterIds: z.array(Id),
  externalPresenters: z.string(), // non-member presenters, free text
  materials: z.array(z.string()), // s3Keys
  photos: z.array(z.string()), // s3Keys
  // 세미나가 소유하는 포스터의 assets 키 (직접 업로드분). 빈 값이면 자동 생성
  // 포스터를 쓴다. 파일 바이트는 assets 버킷, 여기엔 참조 키만.
  posterKey: z.string().default(""),
  activityId: Id.nullable(), // archive↔activity link, stamped at approval
  sourceRequestId: SourceRequestId,
});

export type Seminar = z.infer<typeof SeminarSchema>;
