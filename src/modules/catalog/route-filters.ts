import type { CatalogFilters } from "@/types/catalog";

export type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;
export async function parseFilters(
  searchParams: SearchParams,
): Promise<CatalogFilters> {
  const params = await searchParams;
  const scalar = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  return {
    query: scalar("q"),
    genre: scalar("genre"),
    category: scalar("category"),
    year: scalar("year"),
    rating: scalar("rating"),
    type: scalar("type"),
    sort: scalar("sort"),
    access: scalar("access"),
  };
}
