import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { catalog, getEpisodes } from "../src/modules/catalog/mock-adapter";
import { rolePermissions } from "../src/modules/auth/permissions";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
try {
  for (const [role, permissions] of Object.entries(rolePermissions))
    for (const permission of permissions)
      await db.rolePermission.upsert({
        where: {
          role_permission: {
            role: role as "USER" | "ADMIN" | "SUPER_ADMIN",
            permission,
          },
        },
        create: { role: role as "USER" | "ADMIN" | "SUPER_ADMIN", permission },
        update: {},
      });
  await db.subscriptionPlan.upsert({
    where: { slug: "premium-monthly" },
    create: {
      slug: "premium-monthly",
      name: "Premium Monthly",
      price: 19900,
      currency: "BDT",
      durationDays: 30,
      active: false,
    },
    update: {},
  });
  await db.subscriptionPlan.upsert({
    where: { slug: "premium-yearly" },
    create: {
      slug: "premium-yearly",
      name: "Premium Yearly",
      price: 199000,
      currency: "BDT",
      durationDays: 365,
      active: false,
    },
    update: {},
  });
  if (process.argv.includes("--demo")) {
    if (
      !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
      process.env.NODE_ENV === "production"
    )
      throw new Error("Demo seed is limited to local development databases.");
    const category = await db.category.upsert({
      where: { slug: "development-demo" },
      create: {
        slug: "development-demo",
        name: "Fictional development catalog",
      },
      update: {},
    });
    for (const [index, title] of catalog.entries()) {
      const type =
        title.type === "Series"
          ? index % 2
            ? "WEB_SERIES"
            : "TV_SERIES"
          : title.type === "Short"
            ? index % 2
              ? "SHORT"
              : "SHORT_FILM"
            : title.type === "Anime"
              ? "ANIME"
              : title.type === "Documentary"
                ? "DOCUMENTARY"
                : "MOVIE";
      const existing = await db.content.findUnique({
        where: { slug: title.slug },
      });
      if (existing && !existing.isDemo)
        throw new Error("Seed refused to overwrite non-demo catalog data.");
      const item = await db.content.upsert({
        where: { slug: title.slug },
        create: {
          slug: title.slug,
          title: title.title,
          tagline: title.tagline,
          description: title.description,
          type,
          status: "PUBLISHED",
          publishedAt: new Date(),
          access: title.access === "Free" ? "FREE" : "PREMIUM",
          releaseYear: title.year,
          duration: title.duration,
          editorialRating: title.rating,
          popularity: title.popularity,
          posterPath: title.artwork,
          backdropPath: title.artwork,
          accentColor: title.color,
          isDemo: true,
        },
        update: {},
      });
      for (const name of title.genres) {
        const genre = await db.genre.upsert({
          where: { name },
          create: { name, slug: name.toLowerCase() },
          update: {},
        });
        await db.contentGenre.upsert({
          where: {
            contentId_genreId: { contentId: item.id, genreId: genre.id },
          },
          create: { contentId: item.id, genreId: genre.id },
          update: {},
        });
      }
      await db.contentCategory.upsert({
        where: {
          contentId_categoryId: { contentId: item.id, categoryId: category.id },
        },
        create: { contentId: item.id, categoryId: category.id },
        update: {},
      });
      await db.contentLanguage.upsert({
        where: {
          contentId_language: { contentId: item.id, language: title.language },
        },
        create: { contentId: item.id, language: title.language },
        update: {},
      });
      for (const [position, name] of title.cast.entries()) {
        const person =
          (await db.person.findFirst({ where: { name } })) ||
          (await db.person.create({ data: { name } }));
        await db.contentCast.upsert({
          where: {
            contentId_personId: { contentId: item.id, personId: person.id },
          },
          create: { contentId: item.id, personId: person.id, position },
          update: {},
        });
      }
      const director =
        (await db.person.findFirst({ where: { name: title.director } })) ||
        (await db.person.create({ data: { name: title.director } }));
      await db.contentCrew.upsert({
        where: {
          contentId_personId_job: {
            contentId: item.id,
            personId: director.id,
            job: "Director",
          },
        },
        create: { contentId: item.id, personId: director.id, job: "Director" },
        update: {},
      });
      for (const language of title.subtitles)
        if (
          !(await db.subtitle.findFirst({
            where: { contentId: item.id, language },
          }))
        )
          await db.subtitle.create({ data: { contentId: item.id, language } });
      for (let number = 1; number <= (title.seasons || 0); number++) {
        const season = await db.season.upsert({
          where: { contentId_number: { contentId: item.id, number } },
          create: { contentId: item.id, number },
          update: {},
        });
        for (const episode of getEpisodes(title, number))
          await db.episode.upsert({
            where: {
              seasonId_number: { seasonId: season.id, number: episode.number },
            },
            create: {
              seasonId: season.id,
              number: episode.number,
              title: episode.title,
              description: episode.description,
              duration: episode.duration,
              thumbnailPath: episode.artwork,
              status: "PUBLISHED",
            },
            update: {},
          });
      }
    }
    console.log(
      "30 clearly marked fictional titles seeded into local PostgreSQL. No users, payment success or playback assets seeded.",
    );
  }
  console.log("Role permissions and inactive subscription plans seeded.");
} finally {
  await db.$disconnect();
}
