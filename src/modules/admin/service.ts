import "server-only";
import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { schemas, listSchema, type Resource } from "./schemas";

const models = {
  content: "content",
  seasons: "season",
  episodes: "episode",
  genres: "genre",
  categories: "category",
  sections: "homepageSection",
  banners: "contentBanner",
  plans: "subscriptionPlan",
  coupons: "coupon",
  notifications: "notification",
  assets: "contentAsset",
  subtitles: "subtitle",
  users: "user",
  subscriptions: "subscription",
  payments: "payment",
  logs: "auditLog",
  media: "mediaUpload",
} as const;
export type Collection = keyof typeof models;
// Only this allowlisted adapter uses structural records. All mutations pass a
// resource-specific strict Zod schema before reaching the Prisma delegate.
type Row = Record<string, unknown>;
type Repository = {
  findMany(args: Row): Promise<Row[]>;
  findUnique(args: Row): Promise<Row | null>;
  count(args: Row): Promise<number>;
  create(args: Row): Promise<Row>;
  update(args: Row): Promise<Row>;
  delete(args: Row): Promise<Row>;
};
function repo(db: unknown, key: Collection) {
  return (db as Record<string, unknown>)[models[key]] as Repository;
}
export function collection(value: string): Collection {
  if (!Object.hasOwn(models, value))
    throw new ApiError(404, "NOT_FOUND", "Unknown admin resource.");
  return value as Collection;
}
const userSelect = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  role: true,
  suspendedAt: true,
  createdAt: true,
  updatedAt: true,
};
const includes: Partial<Record<Collection, Row>> = {
  content: {
    genres: true,
    categories: true,
    languages: true,
    cast: { include: { person: true } },
    crew: { include: { person: true } },
    subtitles: { select: { language: true } },
  },
  sections: { items: { orderBy: { position: "asc" } } },
  subscriptions: {
    user: { select: { id: true, name: true, email: true } },
    plan: { select: { name: true } },
    payments: { select: { status: true, liveMode: true, verifiedAt: true } },
  },
  payments: {
    user: { select: { name: true, email: true } },
    transactions: true,
  },
  logs: { user: { select: { name: true, email: true } } },
};
export async function listAdmin(key: Collection, input: unknown) {
  const { q, page, status, sort, type } = listSchema.parse(input);
  const db = getDb();
  const where: Row = {};
  if (key === "content" && type)
    where.type =
      type === "series" ? { in: ["TV_SERIES", "WEB_SERIES", "ANIME"] } : type;
  if (key === "subscriptions" && status === "EXPIRED")
    where.OR = [
      { status: "EXPIRED" },
      { status: "ACTIVE", expiresAt: { lte: new Date() } },
    ];
  const searchFields: Partial<Record<Collection, string[]>> = {
    content: ["title", "slug"],
    users: ["name", "email"],
    genres: ["name"],
    categories: ["name"],
    plans: ["name"],
    coupons: ["code"],
    payments: ["provider", "providerReference"],
    logs: ["action", "resourceId"],
    media: ["name"],
    episodes: ["title"],
    seasons: ["title"],
    sections: ["title"],
    notifications: ["title"],
    banners: ["title"],
  };
  if (q && searchFields[key])
    where.OR = searchFields[key]!.map((field) => ({
      [field]: { contains: q, mode: "insensitive" },
    }));
  if (status) {
    const allowed =
      key === "users"
        ? ["USER", "ADMIN", "SUPER_ADMIN"]
        : key === "subscriptions"
          ? ["ACTIVE", "PENDING", "EXPIRED", "CANCELLED", "REVOKED"]
          : key === "payments"
            ? ["PENDING", "VERIFIED", "FAILED", "REFUNDED"]
            : ["DRAFT", "PUBLISHED", "ARCHIVED"];
    if (!allowed.includes(status))
      throw new ApiError(400, "INVALID_FILTER", "Invalid status filter.");
    if (!(key === "subscriptions" && status === "EXPIRED"))
      where[key === "users" ? "role" : "status"] = status;
  }
  const options: Row = {
    where,
    skip: (page - 1) * 20,
    take: 20,
    orderBy: { createdAt: sort === "oldest" ? "asc" : "desc" },
  };
  if (key === "users") options.select = userSelect;
  else if (includes[key]) options.include = includes[key];
  const [items, total] = await Promise.all([
    repo(db, key).findMany(options),
    repo(db, key).count({ where }),
  ]);
  if (key === "media")
    for (const row of items) {
      row.bytes = Number(row.bytes);
      delete row.storageKey;
      row.path =
        row.kind === "IMAGE" && row.status === "READY"
          ? `/api/media/${row.id}`
          : null;
    }
  if (key === "assets") for (const row of items) delete row.privateStorageKey;
  if (key === "subtitles")
    for (const row of items) delete row.privateStorageKey;
  if (key === "users") {
    const premiumUsers = await db.subscription.findMany({
      where: {
        userId: { in: items.map((i) => String(i.id)) },
        status: "ACTIVE",
        startsAt: { lte: new Date() },
        expiresAt: { gt: new Date() },
        payments: {
          some: {
            status: "VERIFIED",
            liveMode: true,
            verifiedAt: { not: null },
          },
        },
      },
      select: { userId: true },
    });
    for (const row of items)
      row.membership =
        premiumUsers.some((s) => s.userId === row.id) && !row.suspendedAt
          ? "PREMIUM"
          : "FREE";
  }
  if (key === "subscriptions")
    for (const row of items)
      if (
        row.status === "ACTIVE" &&
        new Date(String(row.expiresAt)) <= new Date()
      )
        row.status = "EXPIRED";
  return { items, total, page, pageSize: 20 };
}
export async function detailAdmin(key: Collection, id: string) {
  const db = getDb();
  if (key === "users") {
    const row = await db.user.findUnique({
      where: { id },
      select: {
        ...userSelect,
        profile: true,
        subscriptions: { include: { plan: true } },
        history: {
          take: 20,
          orderBy: { updatedAt: "desc" },
          select: {
            updatedAt: true,
            episodeKey: true,
            content: { select: { title: true } },
          },
        },
        auditLogs: {
          take: 20,
          orderBy: { createdAt: "desc" },
          select: { action: true, createdAt: true, resourceId: true },
        },
      },
    });
    if (!row) throw new ApiError(404, "NOT_FOUND", "User not found.");
    return row;
  }
  const row = await repo(db, key).findUnique({
    where: { id },
    ...(includes[key] ? { include: includes[key] } : {}),
  });
  if (!row) throw new ApiError(404, "NOT_FOUND", "Record not found.");
  if (key === "media" || key === "assets" || key === "subtitles") {
    if (key === "media") row.bytes = Number(row.bytes);
    delete row.storageKey;
    delete row.privateStorageKey;
  }
  return row;
}
export async function mutateAdmin(
  key: Resource,
  id: string | undefined,
  input: unknown,
  actor: string,
) {
  const data = schemas[key].parse(input);
  return getDb().$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(78439012)`;
      let values: Row = { ...data };
      for (const [field, value] of Object.entries(values)) {
        if (
          ["posterPath", "backdropPath", "thumbnailPath", "imagePath"].includes(
            field,
          ) &&
          typeof value === "string" &&
          value.startsWith("/api/media/")
        ) {
          if (
            !(await tx.mediaUpload.findFirst({
              where: {
                id: value.split("/").at(-1),
                status: "READY",
                kind: "IMAGE",
              },
            }))
          )
            throw new ApiError(
              400,
              "INVALID_MEDIA",
              "Choose a ready uploaded image.",
            );
        }
      }
      if (key === "content") {
        const v = data as import("zod").infer<typeof schemas.content>;
        const {
          genreIds,
          categoryIds,
          languages,
          cast,
          director,
          subtitleLanguages,
          ...base
        } = v;
        for (const image of [v.posterPath, v.backdropPath].filter(
          Boolean,
        ) as string[]) {
          if (image.startsWith("/api/media/")) {
            const media = await tx.mediaUpload.findFirst({
              where: {
                id: image.split("/").at(-1),
                kind: "IMAGE",
                status: "READY",
              },
            });
            if (!media)
              throw new ApiError(
                400,
                "INVALID_MEDIA",
                "Choose a ready uploaded image.",
              );
          }
        }
        if (v.status === "PUBLISHED" && !v.publishedAt)
          base.publishedAt = new Date().toISOString();
        if (id) {
          const old = await tx.content.findUniqueOrThrow({
            where: { id },
            include: { seasons: true },
          });
          if (old.type !== v.type && old.seasons.length)
            throw new ApiError(
              409,
              "SERIES_HAS_SEASONS",
              "Remove seasons before changing content type.",
            );
          await tx.contentGenre.deleteMany({ where: { contentId: id } });
          await tx.contentCategory.deleteMany({ where: { contentId: id } });
          await tx.contentLanguage.deleteMany({ where: { contentId: id } });
          await tx.contentCast.deleteMany({ where: { contentId: id } });
          await tx.contentCrew.deleteMany({ where: { contentId: id } });
          await tx.subtitle.deleteMany({
            where: { contentId: id, episodeId: null, privateStorageKey: null },
          });
        }
        const people: { id: string; name: string }[] = [];
        for (const personName of [
          ...new Set([...cast, ...(director ? [director] : [])]),
        ]) {
          const person =
            (await tx.person.findFirst({ where: { name: personName } })) ||
            (await tx.person.create({ data: { name: personName } }));
          people.push(person);
        }
        values = {
          ...base,
          genres: {
            create: [...new Set(genreIds)].map((genreId) => ({ genreId })),
          },
          categories: {
            create: [...new Set(categoryIds)].map((categoryId) => ({
              categoryId,
            })),
          },
          languages: {
            create: [...new Set(languages)].map((language) => ({ language })),
          },
          cast: {
            create: [...new Set(cast)].map((name, position) => ({
              personId: people.find((p) => p.name === name)!.id,
              position,
            })),
          },
          crew: {
            create: director
              ? [
                  {
                    personId: people.find((p) => p.name === director)!.id,
                    job: "Director",
                  },
                ]
              : [],
          },
          subtitles: {
            create: [...new Set(subtitleLanguages)].map((language) => ({
              language,
            })),
          },
        };
      }
      if (key === "sections") {
        const { contentIds, ...rest } = data as import("zod").infer<
          typeof schemas.sections
        >;
        if (id)
          await tx.homepageSectionItem.deleteMany({ where: { sectionId: id } });
        values = {
          ...rest,
          items: {
            create: [...new Set(contentIds)].map((contentId, position) => ({
              contentId,
              position,
            })),
          },
        };
      }
      if (key === "seasons") {
        if (id) {
          const old = await tx.season.findUniqueOrThrow({ where: { id } });
          if (old.contentId !== values.contentId)
            throw new ApiError(
              409,
              "SEASON_IDENTITY",
              "Seasons cannot be moved to another series.",
            );
          if (
            old.number !== values.number &&
            ((await tx.watchHistory.count({
              where: { contentId: old.contentId },
            })) ||
              (await tx.watchProgress.count({
                where: { contentId: old.contentId },
              })))
          )
            throw new ApiError(
              409,
              "VIEWING_EXISTS",
              "Keep season numbering for content with viewer activity.",
            );
        }
        const parent = await tx.content.findUniqueOrThrow({
          where: { id: String(values.contentId) },
        });
        if (!["TV_SERIES", "WEB_SERIES", "ANIME"].includes(parent.type))
          throw new ApiError(
            400,
            "INVALID_SERIES",
            "Seasons require episodic content.",
          );
      }
      if (key === "episodes" && id) {
        const old = await tx.episode.findUniqueOrThrow({
          where: { id },
          include: { season: true },
        });
        if (old.seasonId !== values.seasonId)
          throw new ApiError(
            409,
            "EPISODE_IDENTITY",
            "Episodes cannot be moved to another season.",
          );
        if (
          old.number !== values.number &&
          ((await tx.watchHistory.count({
            where: { contentId: old.season.contentId },
          })) ||
            (await tx.watchProgress.count({
              where: { contentId: old.season.contentId },
            })))
        )
          throw new ApiError(
            409,
            "VIEWING_EXISTS",
            "Keep episode numbering for content with viewer activity.",
          );
      }
      if (key === "plans" && id) {
        const existing = await tx.subscriptionPlan.findUniqueOrThrow({
          where: { id },
          include: { _count: { select: { subscriptions: true } } },
        });
        if (
          existing._count.subscriptions &&
          (existing.price !== values.price ||
            existing.currency !== values.currency ||
            existing.durationDays !== values.durationDays)
        )
          throw new ApiError(
            409,
            "PLAN_IN_USE",
            "Create a new plan version to change billing terms used by subscriptions.",
          );
      }
      if (key === "assets" || key === "subtitles") {
        const { mediaId, authorized: _, ...rest } = values;
        void _;
        const media = await tx.mediaUpload.findUniqueOrThrow({
          where: { id: String(mediaId) },
        });
        if (
          !(key === "assets" ? ["UPLOADED", "READY"] : ["READY"]).includes(
            media.status,
          ) ||
          media.kind !== (key === "assets" ? "VIDEO" : "SUBTITLE")
        )
          throw new ApiError(
            400,
            "INVALID_MEDIA",
            "Choose an appropriate ready managed upload.",
          );
        if (rest.episodeId) {
          const episode = await tx.episode.findUniqueOrThrow({
            where: { id: String(rest.episodeId) },
            include: { season: true },
          });
          if (episode.season.contentId !== rest.contentId)
            throw new ApiError(
              400,
              "INVALID_EPISODE",
              "Episode does not belong to this content.",
            );
        }
        values = {
          ...rest,
          privateStorageKey: media.storageKey,
          ...(key === "assets" ? { ready: true } : {}),
        };
      }
      const record = await (id
        ? repo(tx, key).update({ where: { id }, data: values })
        : repo(tx, key).create({ data: values }));
      await tx.auditLog.create({
        data: {
          userId: actor,
          action: `ADMIN_${key.toUpperCase()}_${id ? "UPDATED" : "CREATED"}`,
          resourceId: String(record.id),
          metadata: { fields: Object.keys(data) },
        },
      });
      delete record.privateStorageKey;
      return record;
    },
    { timeout: 15000 },
  );
}
export async function deleteAdmin(key: Resource, id: string, actor: string) {
  return getDb().$transaction(async (tx) => {
    if (
      key === "assets" &&
      (await tx.playbackSession.count({
        where: { assetId: id, expiresAt: { gt: new Date() } },
      }))
    )
      throw new ApiError(
        409,
        "ACTIVE_PLAYBACK",
        "This video has active viewing sessions. Wait for them to expire before detaching it.",
      );
    if (
      (key === "genres" &&
        (await tx.contentGenre.count({ where: { genreId: id } }))) ||
      (key === "categories" &&
        (await tx.contentCategory.count({ where: { categoryId: id } })))
    )
      throw new ApiError(
        409,
        "IN_USE",
        "Remove content assignments before deleting this classification.",
      );
    if (
      (key === "plans" &&
        (await tx.subscription.count({ where: { planId: id } }))) ||
      (key === "coupons" &&
        (await tx.couponRedemption.count({ where: { couponId: id } })))
    )
      throw new ApiError(
        409,
        "IN_USE",
        "Deactivate this referenced record instead.",
      );
    if (key === "content") {
      const content = await tx.content.findUniqueOrThrow({
        where: { id },
        include: {
          _count: {
            select: {
              history: true,
              progress: true,
              watchlistItems: true,
              ratings: true,
              videoJobs: true,
              assets: true,
              subtitles: true,
              seasons: true,
              sectionItems: true,
              banners: true,
            },
          },
        },
      });
      if (
        content.status === "PUBLISHED" ||
        Object.values(content._count).some(Boolean)
      )
        throw new ApiError(
          409,
          "CONTENT_IN_USE",
          "Unpublish and remove dependent records, or archive content to preserve history.",
        );
    }
    if (
      key === "seasons" &&
      (await tx.episode.count({ where: { seasonId: id } }))
    )
      throw new ApiError(
        409,
        "IN_USE",
        "Remove episodes before deleting the season.",
      );
    if (key === "episodes") {
      const ep = await tx.episode.findUniqueOrThrow({
        where: { id },
        include: {
          season: true,
          _count: { select: { assets: true, subtitles: true } },
        },
      });
      const identity = {
        contentId: ep.season.contentId,
        episodeKey: `s${ep.season.number}e${ep.number}`,
      };
      if (
        ep.status === "PUBLISHED" ||
        ep._count.assets ||
        ep._count.subtitles ||
        (await tx.watchHistory.count({ where: identity })) ||
        (await tx.watchProgress.count({ where: identity }))
      )
        throw new ApiError(
          409,
          "IN_USE",
          "Archive episodes that are published or referenced by viewers/media.",
        );
    }
    await repo(tx, key).delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        userId: actor,
        action: `ADMIN_${key.toUpperCase()}_DELETED`,
        resourceId: id,
      },
    });
    return { deleted: true };
  });
}

export async function reorderEpisodes(
  seasonId: string,
  ids: string[],
  actor: string,
) {
  return getDb().$transaction(async (tx) => {
    const episodes = await tx.episode.findMany({
      where: { seasonId },
      include: { season: true },
    });
    if (
      episodes.length !== ids.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !episodes.some((e) => e.id === id))
    )
      throw new ApiError(
        400,
        "INVALID_ORDER",
        "Submit every episode exactly once.",
      );
    const contentId = episodes[0]?.season.contentId;
    if (
      contentId &&
      ((await tx.watchHistory.count({ where: { contentId } })) ||
        (await tx.watchProgress.count({ where: { contentId } })))
    )
      throw new ApiError(
        409,
        "VIEWING_EXISTS",
        "Episode numbering is part of saved viewing identity; reordering requires a dedicated history migration.",
      );
    for (let i = 0; i < ids.length; i++)
      await tx.episode.update({
        where: { id: ids[i] },
        data: { number: 100000 + i },
      });
    for (let i = 0; i < ids.length; i++)
      await tx.episode.update({
        where: { id: ids[i] },
        data: { number: i + 1 },
      });
    await tx.auditLog.create({
      data: {
        userId: actor,
        action: "ADMIN_EPISODES_REORDERED",
        resourceId: seasonId,
      },
    });
    return { saved: true };
  });
}

export async function manageUser(
  id: string,
  actor: { id: string; role: string },
  input: { suspended?: boolean; role?: "USER" | "ADMIN" | "SUPER_ADMIN" },
) {
  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(78439011)`;
    const target = await tx.user.findUniqueOrThrow({ where: { id } });
    if (id === actor.id)
      throw new ApiError(
        403,
        "SELF_CHANGE",
        "You cannot change your own administrative access or suspension.",
      );
    if (
      (input.role !== undefined && actor.role !== "SUPER_ADMIN") ||
      (target.role !== "USER" && actor.role !== "SUPER_ADMIN")
    )
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Super Admin authorization is required.",
      );
    if (
      target.role === "SUPER_ADMIN" &&
      ((input.role && input.role !== "SUPER_ADMIN") || input.suspended) &&
      (await tx.user.count({
        where: { role: "SUPER_ADMIN", suspendedAt: null },
      })) <= 1
    )
      throw new ApiError(
        409,
        "LAST_SUPER_ADMIN",
        "Keep at least one active Super Admin.",
      );
    await tx.user.update({
      where: { id },
      data: {
        ...(input.role ? { role: input.role } : {}),
        ...(input.suspended !== undefined
          ? { suspendedAt: input.suspended ? new Date() : null }
          : {}),
      },
    });
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        resourceId: id,
        action: "ADMIN_USER_UPDATED",
        metadata: { ...input },
      },
    });
    return { saved: true };
  });
}
