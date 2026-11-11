"use client";

import { useEffect, useState } from "react";
import { useCatalog } from "@/modules/catalog/catalog-provider";
import { apiFetch } from "@/lib/api-client";
import type { CatalogTitle } from "@/types/catalog";
import type { CatalogFilters, ContentType } from "@/types/catalog";
import { FilterPanel } from "./filter-panel";
import { SearchBar } from "./search-bar";
import { ContentGrid } from "./movie-card";
import { CategoryCard } from "./category-card";
import {
  PageHeading,
  LoadingSkeleton,
  ErrorState,
} from "@/components/ui/states";
import { Icon } from "@/components/ui/icon";

export function Discovery({
  heading,
  description,
  type,
  initial = {},
  search = false,
  categories = false,
}: {
  heading: string;
  description: string;
  type?: ContentType;
  initial?: CatalogFilters;
  search?: boolean;
  categories?: boolean;
}) {
  const [filters, setFilters] = useState<CatalogFilters>(initial);
  const { genres, categories: categoryEntries = [] } = useCatalog();
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const filterKey = JSON.stringify({ ...filters, type: type || filters.type });
  const [record, setRecord] = useState<{
    key: string;
    page: number;
    items: CatalogTitle[];
    total: number;
    error?: string;
  }>({ key: "", page: 0, items: [], total: 0 });
  const current = record.key === filterKey;
  const results = current ? record.items : [];
  const total = current ? record.total : 0;
  const loading = !current || record.page !== page;
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    Object.entries(JSON.parse(filterKey) as Record<string, string>).forEach(
      ([key, value]) => {
        if (value) params.set(key === "query" ? "q" : key, value);
      },
    );
    params.set("page", String(page));
    params.set("pageSize", "12");
    apiFetch<CatalogTitle[]>(`catalog?${params}`, { signal: controller.signal })
      .then((response) =>
        setRecord((previous) => ({
          key: filterKey,
          page,
          total: response.meta?.total || 0,
          items:
            page > 1 && previous.key === filterKey
              ? [...previous.items, ...response.data]
              : response.data,
        })),
      )
      .catch((error) => {
        if (!controller.signal.aborted)
          setRecord({
            key: filterKey,
            page,
            items: [],
            total: 0,
            error: error.message,
          });
      });
    return () => controller.abort();
  }, [filterKey, page, attempt]);
  function update(key: keyof CatalogFilters, value: string) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    setPage(1);
    const params = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key === "query" ? "q" : key, value);
    });
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${params.size ? `?${params}` : ""}`,
    );
  }
  function reset() {
    setFilters({});
    setPage(1);
    window.history.replaceState(null, "", window.location.pathname);
  }
  const active = Object.entries(filters).some(
    ([key, value]) => value && key !== "sort",
  );
  return (
    <div className="container page-content">
      <PageHeading
        eyebrow={search ? "FOLLOW YOUR CURIOSITY" : "THE FRAME BD COLLECTION"}
        title={heading}
        description={description}
      />
      {search && (
        <SearchBar
          key={filters.query || "empty"}
          query={filters.query || ""}
          onSearch={(value) => update("query", value)}
        />
      )}
      {categories && categoryEntries.length > 0 && (
        <div
          className="browse-pills category-choices"
          aria-label="Content categories"
        >
          <button
            onClick={() => update("category", "")}
            aria-pressed={!filters.category}
          >
            All categories
          </button>
          {categoryEntries.map((entry) => (
            <button
              key={entry.slug}
              onClick={() => update("category", entry.slug)}
              aria-pressed={filters.category === entry.slug}
            >
              {entry.name} ({entry.count})
            </button>
          ))}
        </div>
      )}
      {categories && !active && (
        <div className="category-grid">
          {genres.map((genre, index) => (
            <CategoryCard
              key={genre.name}
              genre={genre.name}
              index={index}
              count={genre.count}
            />
          ))}
        </div>
      )}
      <FilterPanel filters={filters} update={update} fixedType={type} />
      <div className="results-heading">
        <p role="status">
          <strong>{loading ? "Loading" : total}</strong>{" "}
          {total === 1 ? "title" : "titles"}
          {filters.query && <> for “{filters.query}”</>}{" "}
          <span className="muted">· Database catalog</span>
        </p>
        {active && (
          <button className="text-button" onClick={reset}>
            <Icon name="close" size={14} />
            Reset filters
          </button>
        )}
      </div>
      {current && record.error ? (
        <ErrorState
          title="The catalog could not load."
          description={record.error}
          retry={() => setAttempt(attempt + 1)}
        />
      ) : loading && !results.length ? (
        <LoadingSkeleton />
      ) : results.length > 0 ? (
        <>
          <ContentGrid titles={results} />
          {results.length < total && (
            <div className="load-more">
              <button
                className="button button-secondary"
                disabled={loading}
                onClick={() => setPage(page + 1)}
              >
                {loading ? "Loading…" : "Load more titles"}{" "}
                <Icon name="down" size={17} />
              </button>
              <p>
                Showing {results.length} of {total}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">
            <Icon name="search" size={30} />
          </div>
          <h2>No stories found. Yet.</h2>
          <p>
            Try a different title or broaden your filters. Your next favorite
            might be one click away.
          </p>
          <button className="button button-primary" onClick={reset}>
            Clear search & filters
          </button>
        </div>
      )}
    </div>
  );
}
