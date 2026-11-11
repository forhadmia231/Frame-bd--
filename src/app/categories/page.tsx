import { Discovery } from "@/components/catalog/discovery";
import {
  parseFilters,
  type SearchParams,
} from "@/modules/catalog/route-filters";
export const metadata = { title: "Explore" };
export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const initial = await parseFilters(searchParams);
  return (
    <Discovery
      key={JSON.stringify(initial)}
      heading="Explore"
      description="Follow your mood. Find a genre. Let a new story find you."
      categories
      initial={initial}
    />
  );
}
