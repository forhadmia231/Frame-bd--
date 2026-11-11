"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CatalogTitle } from "@/types/catalog";
export function EpisodeNavigation({
  title,
  current,
}: {
  title: CatalogTitle;
  current?: string;
}) {
  const router = useRouter();
  const all = Object.values(title.episodes || {}).flat();
  if (!all.length) return null;
  const currentIndex = all.findIndex((e) => e.id === current),
    season = current?.match(/^s(\d+)/)?.[1] || Object.keys(title.episodes!)[0];
  const href = (id: string) => `/watch/${title.slug}?episode=${id}`;
  return (
    <nav className="episode-navigation" aria-label="Episode navigation">
      {currentIndex > 0 && (
        <Link
          className="button button-secondary button-small"
          href={href(all[currentIndex - 1].id)}
        >
          ← Previous episode
        </Link>
      )}
      <label>
        Season
        <select
          value={season}
          onChange={(e) => {
            const first = title.episodes?.[e.target.value]?.[0];
            if (first) router.push(href(first.id));
          }}
        >
          {Object.keys(title.episodes || {}).map((number) => (
            <option key={number} value={number}>
              Season {number}
            </option>
          ))}
        </select>
      </label>
      <label>
        Episode
        <select
          value={current || all[0].id}
          onChange={(e) => router.push(href(e.target.value))}
        >
          {title.episodes?.[season].map((ep) => (
            <option key={ep.id} value={ep.id}>
              {ep.number}. {ep.title}
            </option>
          ))}
        </select>
      </label>
      {currentIndex < all.length - 1 && (
        <Link
          className="button button-secondary button-small"
          href={href(all[currentIndex + 1].id)}
        >
          Next episode →
        </Link>
      )}
    </nav>
  );
}
