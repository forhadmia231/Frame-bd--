import type { CatalogTitle, CatalogFilters } from "@/types/catalog";
export const formatDuration = (minutes: number) =>
  minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
export const episodesFor = (title: CatalogTitle, season: number) =>
  title.episodes?.[String(season)] || [];
export function filterTitles(filters: CatalogFilters, source: CatalogTitle[]) {
  return source
    .filter(
      (title) =>
        (!filters.type || title.type === filters.type) &&
        (!filters.access || title.access === filters.access),
    )
    .sort((a, b) =>
      filters.sort === "rating"
        ? b.rating - a.rating
        : filters.sort === "latest"
          ? b.year - a.year
          : b.popularity - a.popularity,
    );
}
