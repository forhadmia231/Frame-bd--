import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function CategoryCard({
  genre,
  count,
  index,
}: {
  genre: string;
  count: number;
  index: number;
}) {
  return (
    <Link
      href={`/categories?genre=${genre}`}
      className={`category-card tone-${index % 5}`}
    >
      <span className="category-number">0{index + 1}</span>
      <div>
        <h2>{genre}</h2>
        <p>{count} demo titles</p>
      </div>
      <Icon name="arrow" />
    </Link>
  );
}
