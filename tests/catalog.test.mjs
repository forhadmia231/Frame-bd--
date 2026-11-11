import test from "node:test";
import assert from "node:assert/strict";
import {
  catalog,
  filterCatalog,
  getTitle,
  getEpisodes,
} from "../src/modules/catalog/mock-adapter.ts";

test("fictional catalog has unique routable slugs and local artwork", () => {
  assert.equal(
    new Set(catalog.map((title) => title.slug)).size,
    catalog.length,
  );
  for (const title of catalog) {
    assert.match(title.slug, /^[a-z0-9-]+$/);
    assert.match(title.artwork, /^\/artwork\/[a-z]+\.jpg$/);
    assert.ok(title.rating >= 0 && title.rating <= 10);
  }
});
test("search trims input and matches titles case-insensitively", () => {
  assert.equal(
    filterCatalog({ query: "  LAST ORBIT " })[0]?.slug,
    "the-last-orbit",
  );
  assert.equal(filterCatalog({ query: "not-a-real-title-xyz" }).length, 0);
});
test("discovery combines all selected filters", () => {
  const title = catalog[0];
  const result = filterCatalog({
    type: title.type,
    genre: title.genres[0],
    year: String(title.year),
    rating: "9",
    access: "Free",
  });
  assert.ok(result.length > 0);
  assert.ok(
    result.every(
      (item) =>
        item.type === title.type &&
        item.genres.includes(title.genres[0]) &&
        item.year === title.year &&
        item.rating >= 9 &&
        item.access === "Free",
    ),
  );
});
test("sorting never mutates source catalog", () => {
  const before = catalog.map((title) => title.slug);
  const rated = filterCatalog({ sort: "rating" });
  assert.ok(
    rated.every(
      (title, index) => index === 0 || rated[index - 1].rating >= title.rating,
    ),
  );
  const latest = filterCatalog({ sort: "latest" });
  assert.ok(
    latest.every(
      (title, index) => index === 0 || latest[index - 1].year >= title.year,
    ),
  );
  assert.deepEqual(
    catalog.map((title) => title.slug),
    before,
  );
});
test("episode identifiers support seasons and reject invalid seasons", () => {
  const series = catalog.find((title) => title.type === "Series");
  assert.equal(getEpisodes(series, 2)[0].id, "s2e1");
  assert.equal(getEpisodes(series, 0).length, 0);
  assert.equal(getEpisodes(series, 3).length, 0);
  assert.equal(getEpisodes(catalog[0], 1).length, 0);
  assert.equal(getTitle("missing-title"), undefined);
});
