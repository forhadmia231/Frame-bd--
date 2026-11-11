"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { useWatchlist } from "@/modules/watchlist/watchlist-provider";
import type { CatalogTitle } from "@/types/catalog";

export function WatchlistButton({
  title,
  compact = false,
}: {
  title: CatalogTitle;
  compact?: boolean;
}) {
  const { saved, ready, toggle, scope } = useWatchlist();
  const active = saved.includes(title.slug);
  return (
    <button
      className={
        compact
          ? `card-save ${active ? "saved" : ""}`
          : "button button-secondary"
      }
      aria-label={`${active ? "Remove" : "Add"} ${title.title} ${active ? "from" : "to"} ${scope} watchlist`}
      aria-pressed={active}
      disabled={!ready}
      onClick={() => toggle(title.slug)}
    >
      <Icon name={active ? "check" : "plus"} size={compact ? 18 : 20} />
      {!compact && (active ? "In My List" : "My Watchlist")}
    </button>
  );
}
export function MovieCard({
  title,
  rank,
  wide = false,
}: {
  title: CatalogTitle;
  rank?: number;
  wide?: boolean;
}) {
  return (
    <article
      className={`movie-card ${wide ? "wide-card" : ""}`}
      style={{ "--poster-accent": title.color } as React.CSSProperties}
    >
      <div className="poster">
        <Link
          href={`/titles/${title.slug}`}
          className="poster-link"
          aria-label={`Details for ${title.title}`}
        >
          <Image
            src={title.artwork}
            alt=""
            fill
            sizes={
              wide
                ? "(max-width: 640px) 75vw, 380px"
                : "(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 220px"
            }
            className="poster-image"
          />
          <div className="poster-shade" />
          <span className="poster-kicker">
            FRAME BD <span>COLLECTION</span>
          </span>
          <div className="poster-lettering">
            <span className="poster-tagline">{title.tagline}</span>
            <strong>{title.title}</strong>
            <span className="poster-caption">
              {title.genres[0]?.toUpperCase() || "FEATURE"} · A FRAME BD STORY
            </span>
          </div>
          <span className="poster-play">
            <Icon name="play" size={24} />
          </span>
        </Link>
        <span className={`access-badge ${title.access.toLowerCase()}`}>
          {title.access === "Premium" && <Icon name="crown" size={11} />}
          {title.access}
        </span>
        <WatchlistButton title={title} compact />
        {rank && (
          <span className="rank" aria-label={`Rank ${rank}`}>
            {String(rank).padStart(2, "0")}
          </span>
        )}
      </div>
      <Link href={`/titles/${title.slug}`} className="card-title">
        {title.title}
      </Link>
      <div className="card-meta">
        <span>{title.year}</span>
        <span className="meta-dot">•</span>
        <span>{title.type}</span>
        <span className="card-rating">
          <Icon name="star" size={11} />
          {title.rating.toFixed(1)}
        </span>
      </div>
    </article>
  );
}
export function ContentGrid({ titles }: { titles: CatalogTitle[] }) {
  return (
    <div className="content-grid">
      {titles.map((title) => (
        <MovieCard key={title.slug} title={title} />
      ))}
    </div>
  );
}
