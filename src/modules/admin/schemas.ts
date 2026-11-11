import { z } from "zod";
const name = z.string().trim().min(1).max(160);
const id = z.string().min(1).max(160);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(150);
const integer = z.number().int().min(0).max(1000000);
const path = z
  .string()
  .regex(/^\/(?!\/)[a-zA-Z0-9/_?=&.%-]*$/)
  .max(500);
export const imagePath = z
  .string()
  .regex(/^\/(?:artwork\/[a-zA-Z0-9._-]+|api\/media\/[a-zA-Z0-9-]+)$/);
const date = z.string().datetime({ offset: true }).nullable().default(null);
const names = z.array(name).max(40).default([]);
export const schemas = {
  content: z
    .object({
      title: name,
      slug,
      tagline: z.string().max(300).default(""),
      description: z.string().min(10).max(12000),
      type: z.enum([
        "MOVIE",
        "TV_SERIES",
        "WEB_SERIES",
        "ANIME",
        "DOCUMENTARY",
        "SHORT_FILM",
        "SHORT",
      ]),
      status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
      access: z.enum(["FREE", "PREMIUM"]).default("FREE"),
      releaseYear: z.number().int().min(1888).max(2100),
      duration: z.number().int().min(1).max(1440),
      editorialRating: z.number().min(0).max(10).default(0),
      popularity: integer.default(0),
      ageRating: name.default("Not rated"),
      production: z.string().max(2000).default(""),
      posterPath: imagePath,
      backdropPath: imagePath.nullable().default(null),
      featured: z.boolean().default(false),
      publishedAt: date,
      availableFrom: date,
      availableUntil: date,
      allowedRegions: z
        .array(z.string().regex(/^[A-Z]{2}$/))
        .max(100)
        .default([]),
      genreIds: z.array(id).max(20).default([]),
      categoryIds: z.array(id).max(20).default([]),
      languages: names,
      cast: names,
      director: z.string().max(160).default(""),
      subtitleLanguages: names,
    })
    .strict()
    .refine(
      (v) =>
        !v.availableUntil ||
        !v.availableFrom ||
        new Date(v.availableUntil) > new Date(v.availableFrom),
      { message: "Availability must end after its start." },
    ),
  seasons: z
    .object({
      contentId: id,
      number: z.number().int().min(1).max(1000),
      title: name,
    })
    .strict(),
  episodes: z
    .object({
      seasonId: id,
      number: z.number().int().min(1).max(10000),
      title: name,
      description: z.string().min(1).max(6000),
      duration: z.number().int().min(1).max(1440),
      thumbnailPath: imagePath,
      status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
      language: name,
      access: z.enum(["FREE", "PREMIUM"]),
    })
    .strict(),
  genres: z
    .object({ name, slug, position: integer, active: z.boolean() })
    .strict(),
  categories: z
    .object({ name, slug, position: integer, active: z.boolean() })
    .strict(),
  sections: z
    .object({
      title: name,
      slug,
      position: integer,
      active: z.boolean(),
      contentIds: z.array(id).max(100),
    })
    .strict(),
  banners: z
    .object({
      contentId: id,
      imagePath,
      title: z.string().max(160),
      description: z.string().max(1000),
      watchPath: path,
      infoPath: path,
      position: integer,
      active: z.boolean(),
    })
    .strict(),
  plans: z
    .object({
      name,
      slug,
      price: z.number().int().min(1).max(100000000),
      currency: z.string().regex(/^[A-Z]{3}$/),
      durationDays: z.number().int().min(1).max(3650),
      features: names,
      active: z.boolean(),
    })
    .strict(),
  coupons: z
    .object({
      code: z.string().regex(/^[A-Z0-9_-]{3,40}$/),
      percent: z.number().int().min(1).max(100),
      expiresAt: date,
      usageLimit: z.number().int().min(1).max(1000000),
      active: z.boolean(),
    })
    .strict(),
  notifications: z
    .object({ userId: id, title: name, body: z.string().min(1).max(2000) })
    .strict(),
  assets: z
    .object({
      contentId: id,
      episodeId: id.nullable().default(null),
      mediaId: id,
      kind: z.literal("ORIGINAL"),
      authorized: z.literal(true),
    })
    .strict(),
  subtitles: z
    .object({
      contentId: id,
      episodeId: id.nullable().default(null),
      mediaId: id,
      language: name,
    })
    .strict(),
};
export const settingsSchema = z
  .object({
    name,
    logo: imagePath.or(z.literal("")),
    favicon: imagePath.or(z.literal("")),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    contact: z.email().or(z.literal("")),
    social: z.array(z.url().refine((s) => s.startsWith("https://"))).max(8),
    seoTitle: name,
    seoDescription: z.string().max(300),
    language: name,
    maintenance: z.boolean(),
    terms: path.or(z.literal("")),
    privacy: path.or(z.literal("")),
  })
  .strict();
export const listSchema = z.object({
  type: z
    .enum([
      "",
      "series",
      "MOVIE",
      "TV_SERIES",
      "WEB_SERIES",
      "ANIME",
      "DOCUMENTARY",
      "SHORT_FILM",
      "SHORT",
    ])
    .default(""),
  q: z.string().max(150).default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  status: z.string().max(30).default(""),
  sort: z.enum(["newest", "oldest"]).default("newest"),
});
export type Resource = keyof typeof schemas;
