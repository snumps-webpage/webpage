import { z } from "zod";
import { Id } from "./common";

export const GalleryDinnerSchema = z.object({
  id: Id,
  year: z.string().min(1),
  photos: z.array(z.string()), // s3Keys
  activityId: Id.nullable(),
});

export type GalleryDinner = z.infer<typeof GalleryDinnerSchema>;
