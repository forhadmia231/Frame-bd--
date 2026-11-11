export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "number"
    | "checkbox"
    | "select"
    | "multi"
    | "list"
    | "date";
  options?: string[];
  lookup?: string;
  value?: unknown;
  help?: string;
};
export const navigation = [
  ["", "Overview", "◫"],
  ["content", "Content library", "▦"],
  ["series", "Series & episodes", "▤"],
  ["media", "Media library", "▧"],
  ["genres", "Genres", "◇"],
  ["categories", "Categories", "▥"],
  ["sections", "Homepage sections", "▱"],
  ["banners", "Hero banners", "▰"],
  ["users", "Users", "◎"],
  ["plans", "Subscription plans", "♧"],
  ["subscriptions", "Subscriptions", "↻"],
  ["payments", "Payments", "▣"],
  ["payment-methods", "Payment methods", "▣"],
  ["coupons", "Coupons", "%"],
  ["analytics", "Analytics", "↗"],
  ["settings", "Platform settings", "⚙"],
  ["notifications", "Notifications", "◉"],
  ["logs", "Audit trail", "≡"],
];
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  extra: Partial<Field> = {},
): Field => ({ key, label, type, ...extra });
const relation = (key: string, label: string, lookup: string) =>
  f(key, label, "select", { lookup });
const image = (key: string, label: string) =>
  f(key, label, "text", {
    help: "Upload in Media library, then paste its /api/media/... image path. Existing /artwork/... paths are supported.",
  });
const status = f("status", "Publication status", "select", {
  options: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  value: "DRAFT",
});
const access = f("access", "Access", "select", {
  options: ["FREE", "PREMIUM"],
  value: "FREE",
});
export const fields: Record<string, Field[]> = {
  media: [f("name", "Media display name")],
  content: [
    f("title", "Title"),
    f("slug", "Slug"),
    f("tagline", "Tagline"),
    f("description", "Synopsis", "textarea"),
    f("type", "Content type", "select", {
      options: [
        "MOVIE",
        "TV_SERIES",
        "WEB_SERIES",
        "ANIME",
        "DOCUMENTARY",
        "SHORT_FILM",
        "SHORT",
      ],
      value: "MOVIE",
    }),
    image("posterPath", "Poster"),
    image("backdropPath", "Backdrop (optional)"),
    f("releaseYear", "Release year", "number", { value: 2026 }),
    f("duration", "Duration in minutes", "number", { value: 90 }),
    f("ageRating", "Age rating", "text", { value: "Not rated" }),
    f("editorialRating", "Internal rating (0–10)", "number", { value: 0 }),
    f("popularity", "Editorial popularity score", "number", { value: 0 }),
    f("genreIds", "Genres", "multi", { lookup: "genres" }),
    f("categoryIds", "Categories", "multi", { lookup: "categories" }),
    f("languages", "Languages, comma separated", "list"),
    f("subtitleLanguages", "Subtitle availability, comma separated", "list"),
    f("cast", "Cast names, comma separated", "list"),
    f("director", "Director"),
    f("production", "Production information", "textarea"),
    access,
    status,
    f("featured", "Feature this title", "checkbox"),
    f("publishedAt", "Publication time / schedule (UTC)", "date", {
      help: "Published + future date schedules visibility. Blank publishes immediately.",
    }),
    f("availableFrom", "Available from (UTC)", "date"),
    f("availableUntil", "Available until (UTC)", "date"),
    f(
      "allowedRegions",
      "Allowed country codes, comma separated (blank = all)",
      "list",
    ),
  ],
  seasons: [
    relation("contentId", "Series / anime", "series"),
    f("number", "Season number", "number", { value: 1 }),
    f("title", "Season title"),
  ],
  episodes: [
    relation("seasonId", "Season", "seasons"),
    f("number", "Episode number", "number", { value: 1 }),
    f("title", "Episode title"),
    f("description", "Synopsis", "textarea"),
    f("duration", "Duration in minutes", "number", { value: 30 }),
    image("thumbnailPath", "Thumbnail"),
    f("language", "Language", "text", { value: "English" }),
    status,
    access,
  ],
  genres: [
    f("name", "Name"),
    f("slug", "Slug"),
    f("position", "Order", "number", { value: 0 }),
    f("active", "Visible", "checkbox", { value: true }),
  ],
  categories: [
    f("name", "Name"),
    f("slug", "Slug"),
    f("position", "Order", "number", { value: 0 }),
    f("active", "Visible", "checkbox", { value: true }),
  ],
  sections: [
    f("title", "Section title"),
    f("slug", "Slug"),
    f("position", "Order", "number", { value: 0 }),
    f("active", "Enabled", "checkbox"),
    f(
      "contentIds",
      "Selected titles (selection order is display order)",
      "multi",
      { lookup: "content" },
    ),
  ],
  banners: [
    relation("contentId", "Featured content", "content"),
    image("imagePath", "Banner image"),
    f("title", "Banner heading"),
    f("description", "Banner description", "textarea"),
    f("watchPath", "Watch destination", "text", { value: "/categories" }),
    f("infoPath", "More info destination", "text", { value: "/categories" }),
    f("position", "Order", "number", { value: 0 }),
    f("active", "Enabled", "checkbox"),
  ],
  plans: [
    f("name", "Name"),
    f("slug", "Slug"),
    f("price", "Price in minor units (BDT 199 = 19900)", "number", {
      value: 19900,
    }),
    f("currency", "Currency", "text", { value: "BDT" }),
    f("durationDays", "Duration in days", "number", { value: 30 }),
    f("features", "Features, comma separated", "list"),
    f("active", "Active (does not enable checkout)", "checkbox"),
  ],
  coupons: [
    f("code", "Coupon code"),
    f("percent", "Discount percentage", "number", { value: 10 }),
    f("expiresAt", "Expiry (UTC)", "date"),
    f("usageLimit", "Maximum redemptions", "number", { value: 1 }),
    f("active", "Active", "checkbox"),
  ],
  notifications: [
    relation("userId", "Recipient", "users"),
    f("title", "Title"),
    f("body", "Message", "textarea"),
  ],
  assets: [
    relation("contentId", "Content", "content"),
    relation("episodeId", "Episode (optional)", "episodes"),
    relation("mediaId", "Ready video upload", "videos"),
    f("kind", "Asset kind", "select", {
      options: ["ORIGINAL"],
      value: "ORIGINAL",
    }),
    f(
      "authorized",
      "I confirm that Frame BD has rights to use this video",
      "checkbox",
    ),
  ],
  subtitles: [
    relation("contentId", "Content", "content"),
    relation("episodeId", "Episode (optional)", "episodes"),
    relation("mediaId", "Ready WebVTT upload", "subtitles"),
    f("language", "Subtitle language"),
  ],
  settings: [
    f("name", "Website name"),
    image("logo", "Logo (optional)"),
    image("favicon", "Favicon (optional)"),
    f("color", "Accent color, hex"),
    f("contact", "Contact email (optional)"),
    f("social", "HTTPS social links, comma separated", "list"),
    f("seoTitle", "SEO title"),
    f("seoDescription", "SEO description", "textarea"),
    f("language", "Default language"),
    f("maintenance", "Maintenance mode", "checkbox"),
    f("terms", "Terms page path (optional)"),
    f("privacy", "Privacy page path (optional)"),
  ],
};
