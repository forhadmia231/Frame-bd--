"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { formatDuration } from "@/modules/catalog/display";
import type { CatalogTitle } from "@/types/catalog";
import { WatchlistButton } from "./movie-card";

export function HeroBanner({ titles, banners }: {
  titles: CatalogTitle[];
  banners: { title: CatalogTitle; heading: string; description: string; image: string; watchPath: string; infoPath: string }[];
}) {
  const [active, setActive] = useState(0);
  const picked = titles.filter((t) => t.featured);
  const featured = banners.length
    ? banners.map((b) => b.title)
    : (picked.length ? picked : titles).slice(0, 3);
  const banner = banners[active] || banners[0];
  const title = featured[active] || featured[0];
  if (!title)
    return (
      <section className="container page-content">
        <h1>A new home for stories.</h1>
        <p>
          The catalog is empty. Published content will appear here when it is
          added.
        </p>
        <Link href="/categories" className="button button-primary">
          Explore categories
        </Link>
      </section>
    );
  return (
    <section className="hero-banner" aria-label="Featured titles">
      <Image
        key={title.slug}
        src={banner?.image || title.backdrop || title.artwork}
        alt=""
        fill
        sizes="100vw"
        preload
        className="hero-image"
      />
      <div className="hero-shade" />
      <div className="container hero-content">
        <div className="hero-label">
          <span className="featured-line" /> FRAME BD SPOTLIGHT{" "}
          <span className="hero-exclusive">FEATURED</span>
        </div>
        <h1>{banner?.heading || title.title}</h1>
        <p className="hero-tagline">{title.tagline}</p>
        <div className="hero-meta">
          <span className="rating">
            <Icon name="star" size={14} />
            {title.rating}
          </span>
          <span>{title.year}</span>
          <span className="age-badge">{title.ageRating || "Not rated"}</span>
          <span>
            {title.type === "Series"
              ? `${title.seasons} Seasons`
              : formatDuration(title.duration)}
          </span>
          <span className="quality-badge">HD</span>
        </div>
        <p className="hero-description">
          {banner?.description || title.description}
        </p>
        <div className="genre-line">
          {title.genres.join(" · ")} <span>•</span> {title.language}
        </div>
        <div className="hero-actions">
          <Link
            href={banner?.watchPath || `/watch/${title.slug}`}
            className="button button-primary"
          >
            <Icon name="play" size={19} /> Watch Now
          </Link>
          <Link
            href={banner?.infoPath || `/titles/${title.slug}`}
            className="button button-glass"
          >
            <Icon name="info" size={19} /> More Info
          </Link>
          <WatchlistButton title={title} compact />
        </div>
        <p className="hero-demo">
          {title.isDemo ? "Fictional demo title · " : ""}Playback is checked
          when you press Play
        </p>
      </div>
      <div className="container hero-bottom">
        <div className="hero-pagination" aria-label="Select featured title">
          {featured.map((item, index) => (
            <button
              key={item.slug}
              onClick={() => setActive(index)}
              aria-label={`Feature ${item.title}`}
              aria-pressed={active === index}
              className={active === index ? "active" : ""}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <i />
            </button>
          ))}
        </div>
        <span className="hero-bottom-note">
          YOUR NEXT GREAT STORY STARTS HERE <Icon name="down" size={13} />
        </span>
        <span className="featured-count">
          0{active + 1}
          <span> / {String(featured.length).padStart(2, "0")}</span>
        </span>
      </div>
    </section>
  );
}
