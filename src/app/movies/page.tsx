import { Discovery } from "@/components/catalog/discovery";
import {
  parseFilters,
  type SearchParams,
} from "@/modules/catalog/route-filters";
export const metadata = { title: "Movies" };
export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const initial = await parseFilters(searchParams);
  return (
    <Discovery
      key={JSON.stringify(initial)}
      heading="Movies"
      description="Big stories. Unforgettable worlds. Find something worth staying in for."
      type="Movie"
      initial={initial}
    />
  );
}
