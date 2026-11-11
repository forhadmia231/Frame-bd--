import Link from "next/link";
import { notFound } from "next/navigation";
import { getContent, relatedContent } from "@/modules/catalog/service";
import { VideoPlayerContainer } from "@/components/player/video-player-container";
import { EpisodeCard } from "@/components/catalog/movie-details";
import { ContentRow } from "@/components/catalog/content-row";
import { Icon } from "@/components/ui/icon";
import { currentUser } from "@/modules/auth/authorization";
import { checkContentAccess } from "@/modules/subscriptions/access";
import { ApiError } from "@/lib/api";
import { EpisodeNavigation } from "@/components/player/episode-navigation";
import { getDb } from "@/lib/db";

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ episode?: string }>;
}) {
  const title = await getContent((await params).videoId);
  if (!title) notFound();
  const user = await currentUser();
  const requestedId = (await searchParams).episode;
  const last =
    title.seasons && user && !requestedId
      ? await getDb().watchProgress.findFirst({
          where: {
            userId: user.id,
            contentId: title.id,
            completed: false,
            position: { gt: 0 },
          },
          orderBy: { updatedAt: "desc" },
          select: { episodeKey: true },
        })
      : null;
  const seasons = Object.values(title.episodes || {}).flat();
  const selectedId = requestedId || seasons.find((episode) => episode.id === last?.episodeKey)?.id;
  const current = selectedId
    ? seasons.find((episode) => episode.id === selectedId)
    : seasons[0];
  if (selectedId && !current) notFound();
  try {
    await checkContentAccess(title.slug, user?.id, current?.id);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return (
      <div className="container page-content">
        <h1>{title.title}</h1>
        <div className="empty-state">
          <h2>
            {error.status === 401
              ? "Sign in to continue"
              : "Premium membership required"}
          </h2>
          <p>{error.message}</p>
          <Link
            className="button button-primary"
            href={error.status === 401 ? "/login" : "/plans"}
          >
            {error.status === 401 ? "Sign in" : "View membership"}
          </Link>
          <Link className="text-link" href={`/titles/${title.slug}`}>
            Back to title details
          </Link>
        </div>
      </div>
    );
  }
  const nextEpisode = current
    ? seasons[seasons.indexOf(current) + 1]
    : undefined;
  return (
    <div className="container page-content watch-page">
      <Link href={`/titles/${title.slug}`} className="back-link">
        <Icon name="left" size={16} />
        Back to details
      </Link>
      <VideoPlayerContainer
        key={`${title.slug}:${current?.id}`}
        title={title}
        episode={current?.id}
        nextHref={
          nextEpisode
            ? `/watch/${title.slug}?episode=${nextEpisode.id}`
            : undefined
        }
      />
      <EpisodeNavigation title={title} current={current?.id} />
      <div className="watch-information">
        <div>
          <p className="eyebrow">
            {title.type.toUpperCase()} · {title.year}
            {title.isDemo ? " · FICTIONAL DEMO" : ""}
          </p>
          <h1>{title.title}</h1>
          {current && (
            <h2>
              {current.id.toUpperCase()} · {current.title}
            </h2>
          )}
          <p>{current?.description || title.description}</p>
        </div>
        <Link
          className="button button-secondary"
          href={`/titles/${title.slug}`}
        >
          Title details <Icon name="info" size={17} />
        </Link>
      </div>
      {nextEpisode && (
        <section className="episodes-section">
          <div className="row-heading">
            <h2>Up Next</h2>
          </div>
          <EpisodeCard title={title} episode={nextEpisode} />
        </section>
      )}
      <ContentRow
        title="Keep Exploring"
        titles={await relatedContent(title.slug)}
        href="/categories"
      />
    </div>
  );
}
