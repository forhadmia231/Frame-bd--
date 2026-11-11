"use client";

import { useCatalog } from "@/modules/catalog/catalog-provider";
import { contentTypes, type CatalogFilters } from "@/types/catalog";
import { Icon } from "@/components/ui/icon";

export function FilterPanel({
  filters,
  update,
  fixedType,
}: {
  filters: CatalogFilters;
  update: (key: keyof CatalogFilters, value: string) => void;
  fixedType?: string;
}) {
  const genres = useCatalog().genres.map((genre) => genre.name);
  return (
    <div className="filter-panel">
      <div className="filter-label">
        <Icon name="filter" size={17} />
        <span>Filters</span>
      </div>
      {!fixedType && (
        <label>
          Content type
          <select
            value={filters.type || ""}
            onChange={(event) => update("type", event.target.value)}
          >
            <option value="">All types</option>
            {contentTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        Genre
        <select
          value={filters.genre || ""}
          onChange={(event) => update("genre", event.target.value)}
        >
          <option value="">All genres</option>
          {genres.map((genre) => (
            <option key={genre}>{genre}</option>
          ))}
        </select>
      </label>
      <label>
        Release year
        <select
          value={filters.year || ""}
          onChange={(event) => update("year", event.target.value)}
        >
          <option value="">All years</option>
          {[2026, 2025, 2024, 2023, 2022].map((year) => (
            <option key={year}>{year}</option>
          ))}
        </select>
      </label>
      <label>
        Rating
        <select
          value={filters.rating || ""}
          onChange={(event) => update("rating", event.target.value)}
        >
          <option value="">Any rating</option>
          <option value="9">9+ Exceptional</option>
          <option value="8">8+ Excellent</option>
          <option value="7">7+ Great</option>
        </select>
      </label>
      <label>
        Access
        <select
          value={filters.access || ""}
          onChange={(event) => update("access", event.target.value)}
        >
          <option value="">Free & Premium</option>
          <option>Free</option>
          <option>Premium</option>
        </select>
      </label>
      <label className="sort-select">
        Sort by
        <select
          value={filters.sort || "popularity"}
          onChange={(event) => update("sort", event.target.value)}
        >
          <option value="popularity">Most popular</option>
          <option value="latest">Latest releases</option>
          <option value="rating">Highest rated</option>
          <option value="az">Title A–Z</option>
        </select>
      </label>
    </div>
  );
}
