import { z } from "zod";
const optional = (schema: z.ZodType) =>
  z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    schema.optional(),
  );
export const catalogQuerySchema = z.object({
  query: optional(z.string().trim().max(150)),
  type: optional(
    z.enum([
      "Movie",
      "Series",
      "Anime",
      "Documentary",
      "Short",
      "MOVIE",
      "TV_SERIES",
      "WEB_SERIES",
      "ANIME",
      "DOCUMENTARY",
      "SHORT_FILM",
      "SHORT",
    ]),
  ),
  genre: optional(z.string().trim().max(60)),
  category: optional(
    z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(150),
  ),
  year: optional(z.coerce.number().int().min(1888).max(2100)),
  rating: optional(z.coerce.number().min(0).max(10)),
  access: optional(z.enum(["Free", "Premium"])),
  sort: z.preprocess(
    (value) => (!value ? "popularity" : value),
    z.enum(["popularity", "latest", "rating", "az"]),
  ),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
});
