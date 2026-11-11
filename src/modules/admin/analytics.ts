import "server-only";
import { getDb } from "@/lib/db";
export async function analytics(days = 30) {
  const db = getDb(),
    now = new Date(),
    from = new Date(now.getTime() - days * 86400000);
  const entitled = {
    status: "ACTIVE" as const,
    startsAt: { lte: now },
    expiresAt: { gt: now },
    payments: {
      some: {
        status: "VERIFIED" as const,
        liveMode: true,
        verifiedAt: { not: null },
      },
    },
  };
  const [
    users,
    activeUsers,
    premium,
    types,
    statuses,
    subscriptions,
    activeSubscriptions,
    expiredSubscriptions,
    payments,
    registrations,
    activity,
    dailyUsers,
    dailySubs,
    revenue,
    publishing,
    watched,
    categories,
    progress,
    renewals,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({
      where: {
        suspendedAt: null,
        sessions: {
          some: { expiresAt: { gt: now }, updatedAt: { gte: from } },
        },
      },
    }),
    db.user.count({
      where: { suspendedAt: null, subscriptions: { some: entitled } },
    }),
    db.content.groupBy({ by: ["type"], _count: true }),
    db.content.groupBy({ by: ["status"], _count: true }),
    db.subscription.count(),
    db.subscription.count({ where: entitled }),
    db.subscription.count({
      where: {
        OR: [
          { status: "EXPIRED" },
          { status: "ACTIVE", expiresAt: { lte: now } },
        ],
      },
    }),
    db.payment.count(),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, name: true, email: true, createdAt: true },
    }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        action: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    db.$queryRaw<
      { date: string; value: number }[]
    >`SELECT to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD') date, count(*)::int value FROM "User" WHERE "createdAt">=${from} GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<
      { date: string; value: number }[]
    >`SELECT to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD') date, count(*)::int value FROM "Subscription" WHERE "createdAt">=${from} GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<
      { date: string; currency: string; value: number }[]
    >`SELECT to_char("verifiedAt" AT TIME ZONE 'UTC','YYYY-MM-DD') date,currency,sum(amount)::float8 value FROM "Payment" WHERE status='VERIFIED' AND "liveMode"=true AND "verifiedAt">=${from} GROUP BY 1,2 ORDER BY 1`,
    db.$queryRaw<
      { date: string; value: number }[]
    >`SELECT to_char("publishedAt" AT TIME ZONE 'UTC','YYYY-MM-DD') date,count(*)::int value FROM "Content" WHERE status='PUBLISHED' AND "publishedAt">=${from} AND "publishedAt"<=${now} GROUP BY 1 ORDER BY 1`,
    db.watchHistory.groupBy({
      by: ["contentId"],
      where: { updatedAt: { gte: from } },
      _count: true,
      orderBy: { _count: { contentId: "desc" } },
      take: 10,
    }),
    db.$queryRaw<
      { name: string; value: number }[]
    >`SELECT c.name,count(h.id)::int value FROM "Category" c JOIN "ContentCategory" cc ON cc."categoryId"=c.id JOIN "WatchHistory" h ON h."contentId"=cc."contentId" WHERE h."updatedAt">=${from} GROUP BY c.id ORDER BY 2 DESC LIMIT 10`,
    db.$queryRaw<
      { date: string; value: number }[]
    >`SELECT to_char("updatedAt" AT TIME ZONE 'UTC','YYYY-MM-DD') date,sum(position)::float8 value FROM "WatchProgress" WHERE "updatedAt">=${from} GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<
      { value: number }[]
    >`SELECT count(*)::int value FROM (SELECT "userId" FROM "Payment" WHERE status='VERIFIED' AND "liveMode"=true AND "verifiedAt">=${from} GROUP BY "userId" HAVING count(*)>1) r`,
  ]);
  const titles = await db.content.findMany({
    where: { id: { in: watched.map((w) => w.contentId) } },
    select: { id: true, title: true },
  });
  const monthly = Object.entries(
    dailyUsers.reduce(
      (out, row) => {
        const m = row.date.slice(0, 7);
        out[m] = (out[m] || 0) + row.value;
        return out;
      },
      {} as Record<string, number>,
    ),
  ).map(([date, value]) => ({ date, value }));
  return {
    days,
    from,
    stats: {
      "Total users": users,
      "Active users (valid session in range)": activeUsers,
      "Free users": users - premium,
      "Premium users": premium,
      "Premium conversion (%)": users
        ? Number(((100 * premium) / users).toFixed(2))
        : 0,
      Movies: types.find((t) => t.type === "MOVIE")?._count || 0,
      Series: types
        .filter((t) => ["TV_SERIES", "WEB_SERIES"].includes(t.type))
        .reduce((n, t) => n + t._count, 0),
      Episodes: await db.episode.count(),
      Anime: types.find((t) => t.type === "ANIME")?._count || 0,
      Documentaries: types.find((t) => t.type === "DOCUMENTARY")?._count || 0,
      "Short films": types.find((t) => t.type === "SHORT_FILM")?._count || 0,
      Shorts: types.find((t) => t.type === "SHORT")?._count || 0,
      Published: statuses.find((s) => s.status === "PUBLISHED")?._count || 0,
      Drafts: statuses.find((s) => s.status === "DRAFT")?._count || 0,
      "Total subscriptions": subscriptions,
      "Active subscriptions (verified)": activeSubscriptions,
      "Expired subscriptions": expiredSubscriptions,
      "Payment records": payments,
      "Repeat purchasers in range": renewals[0]?.value || 0,
    },
    charts: {
      ...(!revenue.length
        ? { "Verified revenue (no matching payments)": [] }
        : {}),
      "Daily registrations": dailyUsers,
      "Monthly registrations": monthly,
      "Subscription records created": dailySubs,
      "Content publishing": publishing,
      "Saved playback positions (seconds; not measured watch time)": progress,
      ...Object.fromEntries(
        [...new Set(revenue.map((r) => r.currency))].map((currency) => [
          `Verified gross receipts (${currency}, minor units; refunded payments excluded)`,
          revenue.filter((r) => r.currency === currency),
        ]),
      ),
    },
    registrations,
    activity,
    mostWatched: watched.map((w) => ({
      name: titles.find((t) => t.id === w.contentId)?.title || "Removed title",
      value: w._count,
    })),
    categories,
  };
}
