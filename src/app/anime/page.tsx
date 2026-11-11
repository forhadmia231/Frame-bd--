import { Discovery } from "@/components/catalog/discovery";
import {
  parseFilters,
  type SearchParams,
} from "@/modules/catalog/route-filters";
export const metadata = { title: "Anime" };
export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const initial = await parseFilters(searchParams);
  return (
    <Discovery
      key={JSON.stringify(initial)}
      heading="Anime"
      description="Extraordinary worlds, limitless imagination. Your next adventure starts here."
      type="Anime"
      initial={initial}
    />
  );
}
