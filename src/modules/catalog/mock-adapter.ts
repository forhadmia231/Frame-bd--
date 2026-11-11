import type { CatalogFilters, CatalogTitle, Episode } from "@/types/catalog";

// Temporary UI adapter. All titles, people, ratings and release dates are fictional.
// Replace this module with API-backed queries without changing presentational components.
const entries: [
  string,
  string,
  CatalogTitle["type"],
  string,
  string,
  string,
  string,
][] = [
  [
    "Beyond the Silence",
    "Movie",
    "Movie",
    "mountains",
    "Adventure,Drama",
    "#9cb2a7",
    "Some journeys begin where the road ends.",
  ],
  [
    "The Last Orbit",
    "Movie",
    "Movie",
    "space",
    "Sci-Fi,Adventure",
    "#93aabd",
    "One signal. An entire universe of possibilities.",
  ],
  [
    "Midnight in Kyoto",
    "Series",
    "Series",
    "japan",
    "Mystery,Drama",
    "#e49a8d",
    "Every lantern hides a different story.",
  ],
  [
    "Wild Earth",
    "Documentary",
    "Documentary",
    "forest",
    "Nature,Adventure",
    "#b1c2a0",
    "Discover the world that keeps us alive.",
  ],
  [
    "Under the Same Sky",
    "Movie",
    "Movie",
    "stars",
    "Romance,Drama",
    "#b7a0cc",
    "A thousand miles apart. One night to remember.",
  ],
  [
    "Crimson Dunes",
    "Movie",
    "Movie",
    "desert",
    "Thriller,Adventure",
    "#e1b385",
    "The desert remembers everything.",
  ],
  [
    "Blue Hour",
    "Short",
    "Short",
    "ocean",
    "Drama,Romance",
    "#a1b8ca",
    "Between the tides, a life changes.",
  ],
  [
    "Neon Ronin",
    "Anime",
    "Anime",
    "city",
    "Action,Sci-Fi",
    "#e5a1c8",
    "A lost city. An unlikely guardian.",
  ],
  [
    "Northbound",
    "Series",
    "Series",
    "snow",
    "Thriller,Mystery",
    "#c8d4da",
    "The truth is buried beneath the ice.",
  ],
  [
    "River of Memories",
    "Movie",
    "Movie",
    "river",
    "Drama,Adventure",
    "#a5b58d",
    "Home is a place you carry with you.",
  ],
  [
    "After the Rain",
    "Anime",
    "Anime",
    "japan",
    "Fantasy,Romance",
    "#cab7d5",
    "A small wish opens an extraordinary world.",
  ],
  [
    "The Long Way Home",
    "Short",
    "Short",
    "road",
    "Drama,Adventure",
    "#d3bd8b",
    "Sometimes the detour is the destination.",
  ],
  [
    "Ocean, Unseen",
    "Documentary",
    "Documentary",
    "ocean",
    "Nature,Adventure",
    "#8cbacb",
    "A world beyond the surface.",
  ],
  [
    "The Quiet Village",
    "Series",
    "Series",
    "night",
    "Drama,Mystery",
    "#9ebbad",
    "Nothing stays secret forever.",
  ],
  [
    "Starlight Express",
    "Anime",
    "Anime",
    "stars",
    "Fantasy,Adventure",
    "#beaadf",
    "The last train travels beyond the stars.",
  ],
  [
    "Into the Canopy",
    "Documentary",
    "Documentary",
    "river",
    "Nature,Adventure",
    "#aec49b",
    "Listen closely. The forest is speaking.",
  ],
  [
    "A Letter to Tomorrow",
    "Short",
    "Short",
    "night",
    "Drama,Romance",
    "#dfb39e",
    "Some words take a lifetime to arrive.",
  ],
  [
    "Parallel Lines",
    "Series",
    "Series",
    "city",
    "Sci-Fi,Thriller",
    "#b0c6d7",
    "Two lives. A single impossible connection.",
  ],
  [
    "Solar Drift",
    "Movie",
    "Movie",
    "space",
    "Sci-Fi,Thriller",
    "#d7c29b",
    "When the sun goes quiet, who will listen?",
  ],
  [
    "Edge of Winter",
    "Movie",
    "Movie",
    "snow",
    "Adventure,Thriller",
    "#d5dadd",
    "The mountain is only the beginning.",
  ],
  [
    "Desert Bloom",
    "Documentary",
    "Documentary",
    "desert",
    "Nature,Drama",
    "#e2bb91",
    "Life finds a way in the most unlikely places.",
  ],
  [
    "Paper Moons",
    "Anime",
    "Anime",
    "night",
    "Fantasy,Drama",
    "#b6cee3",
    "One folded wish can change the sky.",
  ],
  [
    "Seven Minutes",
    "Short",
    "Short",
    "city",
    "Thriller,Mystery",
    "#d1adc0",
    "A chance encounter. A city holding its breath.",
  ],
  [
    "Tides of Change",
    "Series",
    "Series",
    "ocean",
    "Drama,Adventure",
    "#90c8ce",
    "What we leave behind always returns.",
  ],
  [
    "The Green Frontier",
    "Movie",
    "Movie",
    "forest",
    "Adventure,Fantasy",
    "#c4ca9b",
    "Beyond the map, a new world waits.",
  ],
  [
    "Chasing Daylight",
    "Movie",
    "Movie",
    "road",
    "Romance,Adventure",
    "#dfcba4",
    "One summer. No turning back.",
  ],
  [
    "Silent Frequencies",
    "Movie",
    "Movie",
    "stars",
    "Mystery,Sci-Fi",
    "#a6c1d4",
    "There is more to silence than you think.",
  ],
  [
    "Between Two Shores",
    "Movie",
    "Movie",
    "river",
    "Drama,Romance",
    "#adbea0",
    "Every crossing brings us closer.",
  ],
  [
    "The Amber Trail",
    "Movie",
    "Movie",
    "desert",
    "Action,Adventure",
    "#ebbc8b",
    "Follow the light. Find the truth.",
  ],
  [
    "Where Clouds Rest",
    "Movie",
    "Movie",
    "mountains",
    "Drama,Adventure",
    "#bac9b4",
    "Let the world slow down.",
  ],
];

export const catalog: CatalogTitle[] = entries.map(
  ([title, , type, art, genre, color, tagline], index) => ({
    slug: title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-$/, ""),
    title,
    type,
    tagline,
    color,
    description: `${tagline} ${index === 0 ? "A young cartographer follows her father's unfinished map into the remote mountains, discovering that the greatest adventure is finding the courage to come home." : "An intimate journey through unexpected places, unlikely friendships and the choices that change everything. Discover a story that stays with you long after the final frame."}`,
    year: 2026 - (index % 5),
    rating: Number((9.1 - ((index * 7) % 23) / 10).toFixed(1)),
    duration:
      type === "Short"
        ? 12 + (index % 15)
        : type === "Series" || type === "Anime"
          ? 24 + (index % 25)
          : 92 + (index % 45),
    genres: genre.split(","),
    access: index % 3 === 0 ? "Free" : "Premium",
    artwork: `/artwork/${art}.jpg`,
    popularity: 1000 - index * 23,
    added: `2026-${String(11 - (index % 9)).padStart(2, "0")}-${String(1 + (index % 27)).padStart(2, "0")}`,
    language:
      index % 4 === 0 ? "Bangla" : type === "Anime" ? "Japanese" : "English",
    subtitles: ["English", "Bangla"],
    director: ["Arin Rahman", "Nora Sen", "Kai Mori"][index % 3],
    cast: ["Maya Noor", "Rayan Ahmed", "Elena Park"],
    seasons: type === "Series" || type === "Anime" ? 2 : undefined,
  }),
);

export const genres = [
  ...new Set(catalog.flatMap((title) => title.genres)),
].sort();
export const getTitle = (slug: string) =>
  catalog.find((title) => title.slug === slug);
export const formatDuration = (minutes: number) =>
  minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

export function filterCatalog(filters: CatalogFilters, source = catalog) {
  const query = filters.query?.trim().toLowerCase() || "";
  const result = source.filter(
    (title) =>
      (!query ||
        `${title.title} ${title.description} ${title.genres.join(" ")}`
          .toLowerCase()
          .includes(query)) &&
      (!filters.type || title.type === filters.type) &&
      (!filters.genre || title.genres.includes(filters.genre)) &&
      (!filters.year || title.year === Number(filters.year)) &&
      (!filters.rating || title.rating >= Number(filters.rating)) &&
      (!filters.access || title.access === filters.access),
  );
  return result.sort((a, b) =>
    filters.sort === "latest"
      ? b.year - a.year || b.added.localeCompare(a.added)
      : filters.sort === "rating"
        ? b.rating - a.rating
        : filters.sort === "az"
          ? a.title.localeCompare(b.title)
          : b.popularity - a.popularity,
  );
}

export function getEpisodes(title: CatalogTitle, season: number): Episode[] {
  if (!title.seasons || season < 1 || season > title.seasons) return [];
  return [
    "A New Beginning",
    "The Other Side",
    "Hidden Paths",
    "A Familiar Stranger",
    "The Turning Point",
    "Coming Home",
  ].map((name, index) => ({
    id: `s${season}e${index + 1}`,
    number: index + 1,
    title: name,
    description: `In chapter ${index + 1}, an unexpected discovery brings a new perspective. ${title.tagline}`,
    duration: title.duration + (index % 4),
    artwork: title.artwork,
  }));
}

export const catalogAdapter = {
  list: filterCatalog,
  get: getTitle,
  episodes: getEpisodes,
  source: "temporary-fictional-demo" as const,
};
