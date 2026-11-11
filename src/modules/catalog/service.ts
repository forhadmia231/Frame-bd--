import "server-only";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { catalogQuerySchema } from "@/schemas/catalog";
import type { Prisma } from "@/generated/prisma/client";
import type { CatalogTitle, ContentType } from "@/types/catalog";

export function publishedWhere(now = new Date()): Prisma.ContentWhereInput {
  const region = getEnv().APP_REGION;
  return {
    status: "PUBLISHED",
    publishedAt: { lte: now },
    AND: [
      { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
      { OR: [{ availableUntil: null }, { availableUntil: { gt: now } }] },
      {
        OR: [
          { allowedRegions: { isEmpty: true } },
          ...(region ? [{ allowedRegions: { has: region } }] : []),
        ],
      },
    ],
  };
}
const publicSelect = {
  id: true,
  slug: true,
  title: true,
  tagline: true,
  description: true,
  type: true,
  releaseYear: true,
  editorialRating: true,
  duration: true,
  access: true,
  posterPath: true,
  backdropPath: true,
  ageRating: true,
  featured: true,
  accentColor: true,
  popularity: true,
  createdAt: true,
  isDemo: true,
  genres: { select: { genre: { select: { name: true } } } },
  cast: {
    orderBy: { position: "asc" },
    select: { person: { select: { name: true } } },
  },
  crew: { select: { job: true, person: { select: { name: true } } } },
  languages: { select: { language: true } },
  subtitles: { select: { language: true } },
  seasons: {
    orderBy: { number: "asc" },
    select: {
      number: true,
      episodes: {
        where: { status: "PUBLISHED" },
        orderBy: { number: "asc" },
        select: {
          number: true,
          title: true,
          description: true,
          duration: true,
          thumbnailPath: true,
          access: true,
        },
      },
    },
  },
} satisfies Prisma.ContentSelect;
type PublicRecord = Prisma.ContentGetPayload<{ select: typeof publicSelect }>;
const types: Record<string, ContentType> = {
  MOVIE: "Movie",
  TV_SERIES: "Series",
  WEB_SERIES: "Series",
  ANIME: "Anime",
  DOCUMENTARY: "Documentary",
  SHORT_FILM: "Short",
  SHORT: "Short",
};
function dto(item: PublicRecord): CatalogTitle {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    tagline: item.tagline,
    description: item.description,
    type: types[item.type],
    year: item.releaseYear,
    rating: item.editorialRating,
    duration: item.duration,
    genres: item.genres.map((entry) => entry.genre.name),
    access: item.access === "FREE" ? "Free" : "Premium",
    artwork: item.posterPath,
    backdrop: item.backdropPath || item.posterPath,
    ageRating: item.ageRating,
    featured: item.featured,
    color: item.accentColor,
    popularity: item.popularity,
    added: item.createdAt.toISOString(),
    language: item.languages[0]?.language || "Not specified",
    subtitles: [...new Set(item.subtitles.map((entry) => entry.language))],
    director:
      item.crew.find((entry) => entry.job === "Director")?.person.name ||
      "Not specified",
    cast: item.cast.map((entry) => entry.person.name),
    isDemo: item.isDemo,
    seasons: item.seasons.length || undefined,
    episodes: Object.fromEntries(
      item.seasons.map((season) => [
        String(season.number),
        season.episodes.map((episode) => ({
          id: `s${season.number}e${episode.number}`,
          number: episode.number,
          title: episode.title,
          description: episode.description,
          duration: episode.duration,
          artwork: episode.thumbnailPath,
          access: episode.access === "PREMIUM" ? "Premium" : "Free",
        })),
      ]),
    ),
  };
}
export async function listContent(input: Record<string, unknown> = {}) {
  const query = catalogQuerySchema.parse(input);
  const typeMap: Record<string, Prisma.ContentWhereInput> = {
    Movie: { type: "MOVIE" },
    Series: { type: { in: ["TV_SERIES", "WEB_SERIES"] } },
    Anime: { type: "ANIME" },
    Documentary: { type: "DOCUMENTARY" },
    Short: { type: { in: ["SHORT_FILM", "SHORT"] } },
  };
  const where: Prisma.ContentWhereInput = {
    AND: [
      publishedWhere(),
      query.type
        ? typeMap[String(query.type)] || { type: query.type as never }
        : {},
      query.query
        ? {
            OR: [
              { title: { contains: String(query.query), mode: "insensitive" } },
              {
                description: {
                  contains: String(query.query),
                  mode: "insensitive",
                },
              },
              {
                genres: {
                  some: {
                    genre: {
                      name: {
                        contains: String(query.query),
                        mode: "insensitive",
                      },
                    },
                  },
                },
              },
            ],
          }
        : {},
      query.genre
        ? { genres: { some: { genre: { name: String(query.genre) } } } }
        : {},
      query.category
        ? {
            categories: {
              some: {
                category: { slug: String(query.category), active: true },
              },
            },
          }
        : {},
      query.year ? { releaseYear: Number(query.year) } : {},
      query.rating ? { editorialRating: { gte: Number(query.rating) } } : {},
      query.access
        ? { access: query.access === "Free" ? "FREE" : "PREMIUM" }
        : {},
    ],
  };
  const orderBy: Prisma.ContentOrderByWithRelationInput[] =
    query.sort === "latest"
      ? [{ releaseYear: "desc" }, { publishedAt: "desc" }, { id: "asc" }]
      : query.sort === "rating"
        ? [{ editorialRating: "desc" }, { id: "asc" }]
        : query.sort === "az"
          ? [{ title: "asc" }, { id: "asc" }]
          : [{ popularity: "desc" }, { id: "asc" }];
  const db = getDb();
  const [total, items] = await db.$transaction(async (tx) => {
    const total = await tx.content.count({ where });
    const items = await tx.content.findMany({
      where,
      select: publicSelect,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return [total, items] as const;
  });
  return {
    items: items.map(dto),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
export const getContent = cache(async function getContent(slug: string) {
  if (!/^[a-z0-9-]{1,150}$/.test(slug)) return null;
  const item = await getDb().content.findFirst({
    where: { AND: [publishedWhere(), { slug }] },
    select: publicSelect,
  });
  return item ? dto(item) : null;
});

export async function getContentsBySlug(slugs: string[]) {
  if (!slugs.length) return [];
  const rows = await getDb().content.findMany({
    where: { AND: [publishedWhere(), { slug: { in: slugs } }] },
    select: publicSelect,
  });
  const bySlug = new Map(rows.map((row) => [row.slug, dto(row)]));
  return slugs.flatMap((slug) => {
    const item = bySlug.get(slug);
    return item ? [item] : [];
  });
}

export const catalogNavigation = cache(async () => {
  const [genres, categories, demo] = await Promise.all([
    getGenres(),
    getCategories(),
    getDb().content.findFirst({ where: { ...publishedWhere(), isDemo: true }, select: { id: true } }),
  ]);
  return { genres, categories, hasDemo: Boolean(demo) };
});
export async function getGenres() {
  const rows = await getDb().genre.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      name: true,
      _count: { select: { contents: { where: { content: publishedWhere() } } } },
    },
  });
  return rows
    .filter((row) => row._count.contents)
    .map((row) => ({ name: row.name, count: row._count.contents }));
}
export async function relatedContent(slug: string) {
  const title = await getContent(slug);
  if (!title) return [];
  return (
    await getDb().content.findMany({
      where: {
        AND: [
          publishedWhere(),
          {
            slug: { not: slug },
            genres: { some: { genre: { name: { in: title.genres } } } },
          },
        ],
      },
      select: publicSelect,
      orderBy: { popularity: "desc" },
      take: 8,
    })
  ).map(dto);
}
export const homepageContent = cache(async function homepageContent() {
  const [all, navigation] = await Promise.all([
    listContent({ pageSize: 100 }),
    catalogNavigation(),
  ]);
  const [sections, banners] = await Promise.all([
    getDb().homepageSection.findMany({
      orderBy: { position: "asc" },
      include: {
        items: {
          where: { content: publishedWhere() },
          orderBy: { position: "asc" },
          include: { content: { select: publicSelect } },
        },
      },
    }),
    getDb().contentBanner.findMany({
      where: { active: true, content: publishedWhere() },
      orderBy: { position: "asc" },
      include: { content: { select: publicSelect } },
    }),
  ]);
  return {
    categories: navigation.categories,
    titles: all.items,
    genres: navigation.genres,
    source: "postgresql",
    managedSections: sections.length > 0,
    sections: sections
      .filter((s) => s.active)
      .map((s) => ({
        id: s.id,
        title: s.title,
        titles: s.items.map((i) => dto(i.content)),
      })),
    banners: banners.map((b) => ({
      title: dto(b.content),
      heading: b.title,
      description: b.description,
      image: b.imagePath,
      watchPath: b.watchPath,
      infoPath: b.infoPath,
    })),
  };
});

export async function getCategories() {
  const rows = await getDb().category.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      slug: true,
      name: true,
      _count: { select: { contents: { where: { content: publishedWhere() } } } },
    },
  });
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    count: row._count.contents,
  }));
}
