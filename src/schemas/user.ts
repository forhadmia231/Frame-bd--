import { z } from "zod";
export const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    bio: z.string().trim().max(500).optional(),
  })
  .strict();
export const watchlistSchema = z
  .object({ slug: z.string().min(1).max(150) })
  .strict();
export const ratingSchema = z
  .object({
    slug: z.string().min(1).max(150),
    value: z.number().int().min(1).max(10),
  })
  .strict();
export const preferenceSchema = z
  .object({ subtitleLanguage: z.enum(["English", "Bangla", "Off"]) })
  .strict();
