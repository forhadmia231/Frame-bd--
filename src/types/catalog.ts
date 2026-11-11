export const contentTypes = [
  "Movie",
  "Series",
  "Anime",
  "Documentary",
  "Short",
] as const;
export type ContentType = (typeof contentTypes)[number];
export type CatalogTitle = {
  id?: string;
  isDemo?: boolean;
  backdrop?: string;
  ageRating?: string;
  featured?: boolean;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  type: ContentType;
  year: number;
  rating: number;
  duration: number;
  genres: string[];
  access: "Free" | "Premium";
  artwork: string;
  color: string;
  popularity: number;
  added: string;
  language: string;
  subtitles: string[];
  director: string;
  cast: string[];
  seasons?: number;
  episodes?: Record<string, Episode[]>;
};
export type Episode = {
  access?: "Free" | "Premium";
  id: string;
  number: number;
  title: string;
  description: string;
  duration: number;
  artwork: string;
};
export type CatalogFilters = {
  query?: string;
  type?: string;
  genre?: string;
  category?: string;
  year?: string;
  rating?: string;
  sort?: string;
  access?: string;
};
