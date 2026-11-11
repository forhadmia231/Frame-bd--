import { Discovery } from "@/components/catalog/discovery";
import {
  parseFilters,
  type SearchParams,
} from "@/modules/catalog/route-filters";
export const metadata = { title: "Short Films" };
export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const initial = await parseFilters(searchParams);
  return (
    <Discovery
      key={JSON.stringify(initial)}
      heading="Short Films"
      description="Small stories. Lasting impressions. A great watch, even when time is short."
      type="Short"
      initial={initial}
    />
  );
}
