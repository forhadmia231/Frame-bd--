import "server-only";
import { z } from "zod";
import { adminRouter } from "@/modules/admin/router";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { endpoint, ok, body, sameOrigin, ApiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import {
  currentUser,
  requireUser,
  requireRole,
} from "@/modules/auth/authorization";
import { emailConfigured } from "@/modules/auth/email";
import {
  listContent,
  getContent,
  getContentsBySlug,
  getGenres,
  getCategories,
  relatedContent,
  homepageContent,
  publishedWhere,
} from "@/modules/catalog/service";
import {
  checkContentAccess,
  activePremium,
} from "@/modules/subscriptions/access";
import {
  progressSchema,
  saveProgress,
  viewingList,
} from "@/modules/viewing/service";
import {
  profileSchema,
  watchlistSchema,
  ratingSchema,
  preferenceSchema,
} from "@/schemas/user";

export function apiRouter(request: Request, path: string[]) {
  return endpoint(async () => {
    sameOrigin(request);
    const method = request.method;
    const resource = path.join("/");
    if (path[0] === "admin") return adminRouter(request, path.slice(1));
    const url = new URL(request.url);
    const db = getDb();
    if (method === "GET" && resource === "plans")
      return ok(
        await db.subscriptionPlan.findMany({
          select: {
            id: true,
            slug: true,
            name: true,
            price: true,
            currency: true,
            durationDays: true,
            active: true,
            features: true,
          },
          orderBy: { price: "asc" },
        }),
      );
    if (resource === "checkout" && method === "POST")
      throw new ApiError(
        503,
        "PAYMENT_NOT_CONFIGURED",
        "Checkout is not enabled. No payment or subscription has been created.",
      );
    if (method === "GET" && resource === "status")
      return ok({
        emailConfigured: emailConfigured(),
        emailMode: getEnv().EMAIL_DELIVERY_MODE,
        paymentConfigured: !!(
          getEnv().STRIPE_SECRET_KEY && getEnv().STRIPE_WEBHOOK_SECRET
        ),
        region: getEnv().APP_REGION || null,
      });
    if (method === "GET" && resource === "homepage")
      return ok(await homepageContent());
    if (method === "GET" && resource === "genres") return ok(await getGenres());
    if (method === "GET" && resource === "categories")
      return ok(await getCategories());
    if (
      method === "GET" &&
      (resource === "catalog" ||
        resource === "search" ||
        ["catalog/trending", "catalog/latest", "catalog/popular"].includes(
          resource,
        ))
    ) {
      await rateLimit("public-catalog", 600, 60);
      const query = Object.fromEntries(url.searchParams);
      const result = await listContent({
        ...query,
        query: query.q || query.query,
        ...(resource === "catalog/latest" ? { sort: "latest" } : {}),
      });
      return ok(result.items, {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      });
    }
    if (method === "POST" && resource === "catalog/lookup") {
      await rateLimit("public-catalog", 600, 60);
      const { slugs } = await body(request, z.object({
        slugs: z.array(z.string().regex(/^[a-z0-9-]{1,150}$/)).max(200),
      }).strict(), 65536);
      return ok(await getContentsBySlug([...new Set(slugs)]));
    }
    if (method === "GET" && path[0] === "content" && path[1]) {
      const title = await getContent(path[1]);
      if (!title)
        throw new ApiError(
          404,
          "CONTENT_NOT_FOUND",
          "This title is unavailable.",
        );
      if (path.length === 2) return ok(title);
      if (path[2] === "related" || path[2] === "recommendations")
        return ok(await relatedContent(path[1]));
      if (path[2] === "seasons") {
        if (path[3])
          return ok(
            title.episodes?.[
              String(z.coerce.number().int().positive().parse(path[3]))
            ] || [],
          );
        return ok(
          Object.keys(title.episodes || {}).map((season) => ({
            number: Number(season),
            episodeCount: title.episodes![season].length,
          })),
        );
      }
      if (path[2] === "access") {
        const user = await currentUser(request);
        await checkContentAccess(title.slug, user?.id);
        return ok({
          allowed: true,
          streamingConfigured: !!(await db.contentAsset.count({
            where: {
              contentId: title.id,
              kind: "HLS",
              ready: true,
              videoJob: { is: { status: "READY" } },
            },
          })),
          message:
            "Entitlement checked. Playback requires a ready authorized video and a short-lived viewing session.",
        });
      }
    }
    if (resource.startsWith("admin/")) {
      if (resource === "admin/audit-logs" && method === "GET") {
        await requireRole(request, ["ADMIN", "SUPER_ADMIN"]);
        return ok(
          await db.auditLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 100,
            select: {
              id: true,
              userId: true,
              action: true,
              resourceId: true,
              createdAt: true,
            },
          }),
        );
      }
      if (resource === "admin/settings" && method === "GET") {
        await requireRole(request, ["SUPER_ADMIN"]);
        return ok(
          await db.platformSetting.findMany({
            where: {
              key: {
                in: [
                  "site.name",
                  "site.maintenance",
                  "catalog.defaultLanguage",
                ],
              },
            },
          }),
        );
      }
      throw new ApiError(404, "NOT_FOUND", "Unknown administrative resource.");
    }
    if (path[0] !== "me")
      throw new ApiError(404, "NOT_FOUND", "Unknown API resource.");
    const user = await requireUser(request);
    if (method !== "GET") await rateLimit(`user:${user.id}`, 100, 60);
    if (resource === "me/profile") {
      if (method === "GET")
        return ok({
          ...user,
          profile: await db.userProfile.findUnique({
            where: { userId: user.id },
            select: { bio: true },
          }),
          membership: (await activePremium(user.id)) ? "PREMIUM" : "FREE",
        });
      if (method === "PATCH") {
        const input = await body(request, profileSchema);
        await db.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: user.id },
            data: { name: input.name },
          });
          await tx.userProfile.upsert({
            where: { userId: user.id },
            create: { userId: user.id, bio: input.bio || "" },
            update: { bio: input.bio || "" },
          });
          await tx.auditLog.create({
            data: { userId: user.id, action: "PROFILE_UPDATED" },
          });
        });
        return ok({ name: input.name, bio: input.bio || "" });
      }
    }
    if (resource === "me/preferences") {
      if (method === "GET")
        return ok(
          (await db.userPreference.findUnique({
            where: { userId: user.id },
            select: { subtitleLanguage: true },
          })) || { subtitleLanguage: "English" },
        );
      if (method === "PATCH") {
        const input = await body(request, preferenceSchema);
        return ok(
          await db.userPreference.upsert({
            where: { userId: user.id },
            create: { userId: user.id, ...input },
            update: input,
            select: { subtitleLanguage: true },
          }),
        );
      }
    }
    if (resource === "me/watchlist") {
      if (method === "GET") {
        const list = await db.watchlist.findUnique({
          where: { userId: user.id },
          select: {
            items: {
              where: { content: publishedWhere() },
              orderBy: { createdAt: "desc" },
              take: 1000,
              select: { content: { select: { slug: true } } },
            },
          },
        });
        return ok(await getContentsBySlug((list?.items || []).map((item) => item.content.slug)));
      }
      if (method === "POST") {
        const input = await body(request, watchlistSchema);
        const title = await getContent(input.slug);
        if (!title)
          throw new ApiError(404, "CONTENT_NOT_FOUND", "Title unavailable.");
        await db.$transaction(async (tx) => {
          const list = await tx.watchlist.upsert({
            where: { userId: user.id },
            create: { userId: user.id },
            update: {},
          });
          await tx.watchlistItem.upsert({
            where: {
              watchlistId_contentId: {
                watchlistId: list.id,
                contentId: title.id!,
              },
            },
            create: { watchlistId: list.id, contentId: title.id! },
            update: {},
          });
        });
        return ok({ slug: title.slug });
      }
      if (method === "DELETE") {
        await db.watchlistItem.deleteMany({
          where: { watchlist: { userId: user.id } },
        });
        return ok({ cleared: true });
      }
    }
    if (path[1] === "watchlist" && path.length === 3 && method === "DELETE") {
      await db.watchlistItem.deleteMany({
        where: { watchlist: { userId: user.id }, content: { slug: path[2] } },
      });
      return ok({ removed: true });
    }
    if (resource === "me/history" && method === "GET")
      return ok(await viewingList(user.id));
    if (resource === "me/continue-watching" && method === "GET")
      return ok(await viewingList(user.id, true));
    if (path[1] === "history" && path.length === 3 && method === "DELETE") {
      const item = await db.watchHistory.findFirst({
        where: { id: path[2], userId: user.id },
      });
      if (!item)
        throw new ApiError(404, "NOT_FOUND", "History entry not found.");
      await db.$transaction(async (tx) => {
        await tx.watchHistory.delete({ where: { id: item.id } });
        await tx.watchProgress.deleteMany({
          where: {
            userId: user.id,
            contentId: item.contentId,
            episodeKey: item.episodeKey,
          },
        });
      });
      return ok({ removed: true });
    }
    if (resource === "me/progress" && method === "POST")
      return ok(
        await saveProgress(user.id, await body(request, progressSchema)),
      );
    if (resource === "me/ratings" && method === "POST") {
      const input = await body(request, ratingSchema);
      const title = await checkContentAccess(input.slug, user.id);
      if (
        !(await db.watchHistory.findFirst({
          where: { userId: user.id, contentId: title.id },
        }))
      )
        throw new ApiError(
          403,
          "VIEWING_REQUIRED",
          "Watch this title before rating it.",
        );
      return ok(
        await db.userRating.upsert({
          where: {
            userId_contentId: { userId: user.id, contentId: title.id! },
          },
          create: { userId: user.id, contentId: title.id!, value: input.value },
          update: { value: input.value },
          select: { value: true },
        }),
      );
    }
    if (resource === "me/subscription" && method === "GET")
      return ok({
        premium: await activePremium(user.id),
        subscriptions: await db.subscription.findMany({
          where: { userId: user.id },
          select: {
            id: true,
            status: true,
            startsAt: true,
            expiresAt: true,
            autoRenew: true,
            cancelAtPeriodEnd: true,
            cancelledAt: true,
            plan: {
              select: {
                name: true,
                price: true,
                currency: true,
                durationDays: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      });
    if (resource === "me/payments" && method === "GET")
      return ok(
        await db.payment.findMany({
          where: { userId: user.id },
          select: {
            id: true,
            provider: true,
            amount: true,
            currency: true,
            status: true,
            liveMode: true,
            verifiedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      );
    if (resource === "me/subscription/cancel" && method === "POST") {
      const input = await body(
        request,
        z.object({ id: z.string().min(1) }).strict(),
      );
      const result = await db.subscription.updateMany({
        where: {
          id: input.id,
          userId: user.id,
          status: "ACTIVE",
          autoRenew: false,
        },
        data: { cancelAtPeriodEnd: true, cancelledAt: new Date() },
      });
      if (!result.count)
        throw new ApiError(
          409,
          "NOT_CANCELLABLE",
          "No eligible non-renewing subscription found. Provider-managed renewal requires its configured provider.",
        );
      return ok({ cancelAtPeriodEnd: true });
    }
    throw new ApiError(
      405,
      "METHOD_NOT_ALLOWED",
      "This operation is not supported.",
    );
  });
}
