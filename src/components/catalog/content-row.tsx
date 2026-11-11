"use client";

import Link from "next/link";
import { useRef } from "react";
import { MovieCard } from "./movie-card";
import { Icon } from "@/components/ui/icon";
import type { CatalogTitle } from "@/types/catalog";

export function ContentRow({
  title,
  subtitle,
  titles,
  href,
  ranked = false,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  titles: CatalogTitle[];
  href: string;
  ranked?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) =>
    ref.current?.scrollBy({
      left: direction * ref.current.clientWidth * 0.8,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  return (
    <section className="content-section" aria-label={title}>
      <div className="row-heading">
        <div>
          <h2>
            {ranked && (
              <span className="trending-mark" aria-hidden="true">
                ↗
              </span>
            )}
            {title}
          </h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="row-actions">
          <Link href={href}>
            View all <Icon name="right" size={13} />
          </Link>
          <div className="row-arrows">
            <button
              className="icon-button"
              aria-label={`Scroll ${title} left`}
              onClick={() => scroll(-1)}
            >
              <Icon name="left" size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={`Scroll ${title} right`}
              onClick={() => scroll(1)}
            >
              <Icon name="right" size={16} />
            </button>
          </div>
        </div>
      </div>
      <div
        className={`content-row ${wide ? "wide-row" : ""}`}
        ref={ref}
        tabIndex={0}
        aria-label={`${title} carousel; scroll to browse`}
      >
        {titles.map((item, index) => (
          <MovieCard
            key={item.slug}
            title={item}
            rank={ranked ? index + 1 : undefined}
            wide={wide}
          />
        ))}
      </div>
    </section>
  );
}
