"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { ContentRow } from "./content-row";
import { MovieCard, WatchlistButton } from "./movie-card";
import {
  episodesFor as getEpisodes,
  formatDuration,
} from "@/modules/catalog/display";
import type { CatalogTitle, Episode } from "@/types/catalog";

export function EpisodeCard({
  episode,
  title,
}: {
  episode: Episode;
  title: CatalogTitle;
}) {
  return (
    <Link
      className="episode-card"
      href={`/watch/${title.slug}?episode=${episode.id}`}
    >
      <div className="episode-thumb">
        <Image
          src={episode.artwork}
          alt=""
          fill
          sizes="(max-width: 640px) 40vw, 220px"
        />
        <span>
          <Icon name="play" size={21} />
        </span>
      </div>
      <div>
        <div className="episode-title">
          <h3>
            {String(episode.number).padStart(2, "0")}. {episode.title}
          </h3>
          <span>{episode.duration}m</span>
        </div>
        <p>{episode.description}</p>
      </div>
      <Icon className="episode-arrow" name="right" size={20} />
    </Link>
  );
}
export function MovieDetails({
  title,
  related,
}: {
  title: CatalogTitle;
  related: CatalogTitle[];
}) {
  const [season, setSeason] = useState(1);
  return (
    <>
      <div className="details-backdrop">
        <Image src={title.artwork} alt="" fill sizes="100vw" preload />
        <div />
      </div>
      <div className="container details-content">
        <Link
          className="back-link"
          href={
            title.type === "Movie"
              ? "/movies"
              : title.type === "Series"
                ? "/series"
                : title.type === "Anime"
                  ? "/anime"
                  : title.type === "Documentary"
                    ? "/documentaries"
                    : "/shorts"
          }
        >
          <Icon name="left" size={16} />
          Back to{" "}
          {title.type === "Series" ? "series" : `${title.type.toLowerCase()}s`}
        </Link>
        <div className="details-main">
          <div className="detail-poster">
            <MovieCard title={title} />
          </div>
          <div className="details-copy">
            <p className="eyebrow">
              FRAME BD COLLECTION{" "}
              {title.isDemo && (
                <span className="demo-label">FICTIONAL DEMO</span>
              )}
            </p>
            <h1>{title.title}</h1>
            <p className="detail-tagline">{title.tagline}</p>
            <div className="hero-meta">
              <span className="rating">
                <Icon name="star" size={15} />
                {title.rating}/10
              </span>
              <span>{title.year}</span>
              <span className="age-badge">
                {title.ageRating || "Not rated"}
              </span>
              <span>
                {title.seasons
                  ? `${title.seasons} Seasons`
                  : formatDuration(title.duration)}
              </span>
              <span
                className={`access-badge inline ${title.access.toLowerCase()}`}
              >
                {title.access}
              </span>
            </div>
            <div className="genre-chips">
              {title.genres.map((genre) => (
                <Link href={`/categories?genre=${genre}`} key={genre}>
                  {genre}
                </Link>
              ))}
            </div>
            <p className="synopsis">{title.description}</p>
            <div className="detail-actions">
              <Link
                className="button button-primary"
                href={`/watch/${title.slug}`}
              >
                <Icon name="play" size={18} />
                Watch Now
              </Link>
              <WatchlistButton title={title} />
            </div>
            <dl className="credits">
              <div>
                <dt>Director</dt>
                <dd>{title.director}</dd>
              </div>
              <div>
                <dt>Cast</dt>
                <dd>{title.cast.join(", ")}</dd>
              </div>
              <div>
                <dt>Language</dt>
                <dd>{title.language}</dd>
              </div>
              <div>
                <dt>Subtitles</dt>
                <dd>{title.subtitles.join(", ")}</dd>
              </div>
            </dl>
            <p className="fine-print">
              {title.isDemo
                ? "Development title: metadata and people are fictional. "
                : ""}
              Access is checked on the server. Video playback awaits licensed
              media processed through the private streaming pipeline.
            </p>
          </div>
        </div>
        {title.seasons && (
          <section className="episodes-section">
            <div className="row-heading">
              <h2>Episodes</h2>
              <label className="season-select">
                <span className="sr-only">Select season</span>
                <select
                  value={season}
                  onChange={(event) => setSeason(Number(event.target.value))}
                >
                  {Array.from({ length: title.seasons }, (_, index) => (
                    <option key={index} value={index + 1}>
                      Season {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="episode-list">
              {getEpisodes(title, season).map((episode) => (
                <EpisodeCard key={episode.id} episode={episode} title={title} />
              ))}
            </div>
          </section>
        )}
        <ContentRow
          title="More Like This"
          titles={related}
          href={`/categories?genre=${title.genres[0]}`}
        />
      </div>
    </>
  );
}
