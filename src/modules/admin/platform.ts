import "server-only";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { settingsSchema } from "./schemas";
export const platformSettings = cache(async () => {
  const row = await getDb().platformSetting.findUnique({
    where: { key: "brand" },
  });
  const parsed = settingsSchema.safeParse(row?.value);
  return parsed.success
    ? parsed.data
    : {
        name: "Frame BD",
        logo: "",
        favicon: "",
        color: "#e50914",
        contact: "",
        social: [],
        seoTitle: "Frame BD — A story for every mood",
        seoDescription: "Discover movies, series and anime.",
        language: "English",
        maintenance: false,
        terms: "",
        privacy: "",
      };
});
