"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { apiFetch } from "@/lib/api-client";
import type { CatalogTitle } from "@/types/catalog";

export function SearchBar({
  query,
  onSearch,
}: {
  query: string;
  onSearch: (query: string) => void;
}) {
  const [draft, setDraft] = useState(query);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [matches, setMatches] = useState<{
    query: string;
    items: CatalogTitle[];
  }>({ query: "", items: [] });
  useEffect(() => {
    if (!suggestionsOpen || draft.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch<CatalogTitle[]>(
        `search?q=${encodeURIComponent(draft.trim())}&pageSize=5`,
        { signal: controller.signal },
      )
        .then((response) => setMatches({ query: draft, items: response.data }))
        .catch(() => {
          if (!controller.signal.aborted)
            setMatches({ query: draft, items: [] });
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft, suggestionsOpen]);
  const suggestions = matches.query === draft ? matches.items : [];
  return (
    <div className="search-container">
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(draft);
          setSuggestionsOpen(false);
        }}
      >
        <Icon name="search" size={23} />
        <label className="sr-only" htmlFor="catalog-search">
          Search titles, genres and stories
        </label>
        <input
          id="catalog-search"
          type="search"
          value={draft}
          autoComplete="off"
          placeholder="A title, a genre, a whole new world…"
          onFocus={() => setSuggestionsOpen(true)}
          onChange={(event) => {
            setDraft(event.target.value);
            setSuggestionsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSuggestionsOpen(false);
          }}
        />
        {draft && (
          <button
            type="button"
            className="icon-button"
            aria-label="Clear search"
            onClick={() => {
              setDraft("");
              onSearch("");
              setSuggestionsOpen(false);
            }}
          >
            <Icon name="close" size={18} />
          </button>
        )}
        <button className="button button-primary" type="submit">
          Search
        </button>
      </form>
      {suggestionsOpen && suggestions.length > 0 && (
        <div className="search-suggestions" aria-label="Search suggestions">
          <p>Suggested titles</p>
          {suggestions.map((title) => (
            <button
              key={title.slug}
              onClick={() => {
                setDraft(title.title);
                onSearch(title.title);
                setSuggestionsOpen(false);
              }}
            >
              <Icon name="search" size={15} />
              <span>{title.title}</span>
              <small>
                {title.type} · {title.year}
              </small>
              <Icon name="arrow" size={15} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
