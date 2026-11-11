import { notFound } from "next/navigation";
import { getContent, relatedContent } from "@/modules/catalog/service";
import { MovieDetails } from "@/components/catalog/movie-details";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const title = await getContent((await params).slug);
  return { title: title?.title || "Title not found" };
}
export default async function TitlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const title = await getContent((await params).slug);
  if (!title) notFound();
  return (
    <MovieDetails title={title} related={await relatedContent(title.slug)} />
  );
}
