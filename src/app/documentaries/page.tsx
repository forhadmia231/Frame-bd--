import { Discovery } from "@/components/catalog/discovery";
import {
  parseFilters,
  type SearchParams,
} from "@/modules/catalog/route-filters";
export const metadata = { title: "Documentaries" };
export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const initial = await parseFilters(searchParams);
  return (
    <Discovery
      key={JSON.stringify(initial)}
      heading="Documentaries"
      description="New perspectives on the world around us. Explore our imagined documentary collection."
      type="Documentary"
      initial={initial}
    />
  );
}
