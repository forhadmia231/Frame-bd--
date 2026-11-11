import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { ApiError, body, ok } from "@/lib/api";
import { adminRequest, superAdmin } from "./access";
import { analytics } from "./analytics";
import { schemas, settingsSchema, type Resource } from "./schemas";
import {
  collection,
  listAdmin,
  detailAdmin,
  mutateAdmin,
  deleteAdmin,
  manageUser,
  reorderEpisodes,
} from "./service";
import { uploadSmall, prepareVideo, completeVideo, deleteMedia } from "./media";
import { paymentMethodsSchema } from "./payment-methods";
export async function adminRouter(request: Request, path: string[]) {
  const user = await adminRequest(request);
  const method = request.method;
  const [resource, id, action] = path;
  const query = Object.fromEntries(new URL(request.url).searchParams);
  if (resource === "payment-methods") {
    if (id) throw new ApiError(404, "NOT_FOUND", "Payment method route not found.");
    superAdmin(user.role);
    if (method === "GET") {
      const row = await getDb().platformSetting.findUnique({where: {key: "payment-methods"}});
      return ok(row ? paymentMethodsSchema.parse(row.value) : {methods: []});
    }
    if (method === "PATCH") {
      const values = await body(request, paymentMethodsSchema);
      await getDb().$transaction(async tx => {
        await tx.platformSetting.upsert({where: {key: "payment-methods"}, create: {key: "payment-methods", value: values}, update: {value: values}});
        await tx.auditLog.create({data: {userId: user.id, action: "ADMIN_PAYMENT_METHODS_UPDATED", resourceId: "payment-methods", metadata: {count: values.methods.length}}});
      });
      return ok({saved: true});
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use GET or PATCH.");
  }
  if (resource === "overview" || resource === "analytics") {
    if (method !== "GET")
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Read-only resource.");
    return ok(
      await analytics(
        z.coerce
          .number()
          .int()
          .min(7)
          .max(365)
          .parse(query.days || 30),
      ),
    );
  }
  if (resource === "settings") {
    superAdmin(user.role);
    if (method === "GET")
      return ok(
        (await getDb().platformSetting.findUnique({ where: { key: "brand" } }))
          ?.value || {
          name: "Frame BD",
          logo: "",
          favicon: "",
          color: "#e50914",
          contact: "",
          social: [],
          seoTitle: "Frame BD — A story for every mood",
          seoDescription: "Discover movies, series and anime.",
          language: "English",
          maintenance: false,
          terms: "",
          privacy: "",
        },
      );
    if (method === "PATCH") {
      const values = await body(request, settingsSchema);
      return ok(
        await getDb().$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(78439012)`;
          for (const image of [values.logo, values.favicon].filter((s) =>
            s.startsWith("/api/media/"),
          )) {
            if (
              !(await tx.mediaUpload.findFirst({
                where: {
                  id: image.split("/").at(-1),
                  kind: "IMAGE",
                  status: "READY",
                },
              }))
            )
              throw new ApiError(
                400,
                "INVALID_MEDIA",
                "Choose a ready managed brand image.",
              );
          }
          await tx.platformSetting.upsert({
            where: { key: "brand" },
            create: { key: "brand", value: values },
            update: { value: values },
          });
          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: "ADMIN_SETTINGS_UPDATED",
              resourceId: "brand",
              metadata: { fields: Object.keys(values) },
            },
          });
          return { saved: true };
        }),
      );
    }
  }
  if (resource === "upload" && method === "POST")
    return ok(await uploadSmall(request, user.id), undefined, 201);
  if (resource === "options" && method === "GET") {
    const db = getDb();
    const [content, genres, categories, seasons, episodes, users, media] =
      await Promise.all([
        db.content.findMany({
          take: 1000,
          orderBy: { title: "asc" },
          select: { id: true, title: true, type: true },
        }),
        db.genre.findMany({
          orderBy: { name: "asc" },
          take: 1000,
          select: { id: true, name: true },
        }),
        db.category.findMany({
          orderBy: { name: "asc" },
          take: 1000,
          select: { id: true, name: true },
        }),
        db.season.findMany({
          take: 1000,
          orderBy: [{ contentId: "asc" }, { number: "asc" }],
          include: { content: { select: { title: true } } },
        }),
        db.episode.findMany({
          take: 1000,
          orderBy: [{ seasonId: "asc" }, { number: "asc" }],
          include: {
            season: { include: { content: { select: { title: true } } } },
          },
        }),
        db.user.findMany({
          take: 1000,
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true },
        }),
        db.mediaUpload.findMany({
          take: 1000,
          where: { status: { in: ["READY", "UPLOADED"] } },
          select: { id: true, name: true, kind: true },
        }),
      ]);
    return ok({
      content: content.map((v) => ({ id: v.id, label: v.title, type: v.type })),
      series: content
        .filter((v) => ["TV_SERIES", "WEB_SERIES", "ANIME"].includes(v.type))
        .map((v) => ({ id: v.id, label: v.title })),
      genres: genres.map((v) => ({ id: v.id, label: v.name })),
      categories: categories.map((v) => ({ id: v.id, label: v.name })),
      seasons: seasons.map((v) => ({
        id: v.id,
        label: `${v.content.title} · Season ${v.number}`,
      })),
      episodes: episodes.map((v) => ({
        id: v.id,
        seasonId: v.seasonId,
        contentId: v.season.contentId,
        number: v.number,
        label: `${v.season.content.title} S${v.season.number}E${v.number} · ${v.id}`,
      })),
      users: users.map((v) => ({ id: v.id, label: `${v.name} (${v.email})` })),
      videos: media
        .filter((v) => v.kind === "VIDEO")
        .map((v) => ({ id: v.id, label: v.name })),
      subtitles: media
        .filter((v) => v.kind === "SUBTITLE")
        .map((v) => ({ id: v.id, label: v.name })),
    });
  }
  if (resource === "video-upload" && method === "POST")
    return ok(
      await prepareVideo(
        await body(
          request,
          z
            .object({
              name: z.string().min(1).max(160),
              bytes: z.number().int().min(1).max(2000000000),
              mime: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
              authorized: z.literal(true),
            })
            .strict(),
        ),
        user.id,
      ),
    );
  if (resource === "media" && id && action === "complete" && method === "POST")
    return ok(await completeVideo(id, user.id));
  if (resource === "media" && id && method === "DELETE")
    return ok(await deleteMedia(id, user.id));
  if (resource === "media" && id && method === "PATCH") {
    const input = await body(
      request,
      z.object({ name: z.string().trim().min(1).max(160) }).strict(),
    );
    await getDb().$transaction(async (tx) => {
      await tx.mediaUpload.update({ where: { id }, data: input });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "ADMIN_MEDIA_METADATA_UPDATED",
          resourceId: id,
          metadata: { fields: ["name"] },
        },
      });
    });
    return ok({ saved: true });
  }
  if (resource === "episodes" && action === "reorder" && method === "POST") {
    const input = await body(
      request,
      z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }).strict(),
    );
    return ok(await reorderEpisodes(id, input.ids, user.id));
  }
  if (resource === "users" && id && method === "PATCH") {
    const input = await body(
      request,
      z
        .object({
          suspended: z.boolean().optional(),
          role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
        })
        .strict()
        .refine((v) => Object.keys(v).length > 0),
    );
    return ok(await manageUser(id, user, input));
  }
  if (
    resource === "notifications" &&
    id &&
    action === "read" &&
    method === "POST"
  ) {
    const notification = await getDb().notification.findFirst({
      where: { id, userId: user.id },
    });
    if (!notification)
      throw new ApiError(404, "NOT_FOUND", "Your notification was not found.");
    await getDb().notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return ok({ read: true });
  }
  const key = collection(resource === "audit-logs" ? "logs" : resource);
  if (method === "GET")
    return id
      ? ok(await detailAdmin(key, id))
      : ok(await listAdmin(key, query));
  if (!Object.hasOwn(schemas, key))
    throw new ApiError(
      405,
      "READ_ONLY",
      "This resource cannot be manually modified.",
    );
  if (["plans", "coupons"].includes(key)) superAdmin(user.role);
  if (method === "DELETE" && id)
    return ok(await deleteAdmin(key as Resource, id, user.id));
  if ((method === "POST" && !id) || (method === "PATCH" && id)) {
    const input = await body(request, schemas[key as Resource]);
    return ok(
      await mutateAdmin(key as Resource, id, input, user.id),
      undefined,
      id ? 200 : 201,
    );
  }
  throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported action.");
}
