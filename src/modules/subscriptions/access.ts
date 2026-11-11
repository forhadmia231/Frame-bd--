import "server-only";
import { getDb } from "@/lib/db";
import { getContent } from "@/modules/catalog/service";
import { ApiError } from "@/lib/api";

export async function activePremium(userId: string, now = new Date()) {
  return !!(await getDb().subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      startsAt: { lte: now },
      expiresAt: { gt: now },
      payments: {
        some: {
          userId,
          status: "VERIFIED",
          liveMode: true,
          verifiedAt: { not: null },
        },
      },
    },
    select: { id: true },
  }));
}
export async function checkContentAccess(
  slug: string,
  userId?: string,
  episodeKey?: string,
) {
  const title = await getContent(slug); // publication, rights-window and trusted server region checks
  if (!title)
    throw new ApiError(
      404,
      "CONTENT_NOT_FOUND",
      "This title is not available.",
    );
  const episode = episodeKey
    ? Object.values(title.episodes || {})
        .flat()
        .find((e) => e.id === episodeKey)
    : undefined;
  if (episodeKey && !episode)
    throw new ApiError(404, "EPISODE_NOT_FOUND", "Select a published episode.");
  if (title.access === "Premium" || episode?.access === "Premium") {
    if (!userId)
      throw new ApiError(
        401,
        "UNAUTHENTICATED",
        "Sign in to access premium content.",
      );
    if (!(await activePremium(userId)))
      throw new ApiError(
        403,
        "PREMIUM_REQUIRED",
        "An active verified premium subscription is required.",
      );
  }
  return title;
}
