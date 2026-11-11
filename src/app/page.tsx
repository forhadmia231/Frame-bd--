import Link from "next/link";
import { HeroBanner } from "@/components/catalog/hero-banner";
import { ContentRow } from "@/components/catalog/content-row";
import { ContinueWatchingRow } from "@/components/catalog/continue-row";
import { homepageContent } from "@/modules/catalog/service";
import { filterTitles } from "@/modules/catalog/display";
import { Icon } from "@/components/ui/icon";

export default async function Home() {
  const {
    titles: catalog,
    managedSections,
    sections,
    banners,
  } = await homepageContent();
  const filterCatalog = (filters: import("@/types/catalog").CatalogFilters) =>
    filterTitles(filters, catalog);
  if (managedSections)
    return (
      <>
        <HeroBanner titles={catalog} banners={banners} />
        <div className="container home-content">
          <ContinueWatchingRow />
          {sections.map((section) => (
            <ContentRow
              key={section.id}
              title={section.title}
              titles={section.titles}
              href="/categories"
            />
          ))}
        </div>
      </>
    );
  return (
    <>
      <HeroBanner titles={catalog} banners={banners} />
      <div className="container home-content">
        <div className="browse-pills">
          <span>Find your next obsession</span>
          {[
            ["/movies", "Movies"],
            ["/series", "Series"],
            ["/anime", "Anime"],
            ["/documentaries", "Documentaries"],
            ["/shorts", "Short Films"],
          ].map(([href, title]) => (
            <Link href={href} key={href}>
              {title}
            </Link>
          ))}
          <Link href="/categories" className="all-genres">
            All genres <Icon name="arrow" size={15} />
          </Link>
        </div>
        <ContentRow
          title="Trending Now"
          subtitle="The stories everyone will be talking about"
          titles={catalog.slice(0, 8)}
          href="/categories?sort=popularity"
          ranked
        />
        <ContinueWatchingRow />
        <ContentRow
          title="Popular Movies"
          titles={filterCatalog({ type: "Movie" }).slice(2, 10)}
          href="/movies"
        />
        <ContentRow
          title="Recently Added"
          subtitle="Fresh perspectives. New favorites."
          titles={[...catalog]
            .sort((a, b) => b.added.localeCompare(a.added))
            .slice(3, 11)}
          href="/categories?sort=latest"
          wide
        />
        <div className="membership-banner">
          <div className="membership-emblem">
            <Icon name="crown" size={40} />
          </div>
          <div>
            <p className="eyebrow">A LITTLE MORE EXTRAORDINARY</p>
            <h2>Make every night a movie night.</h2>
            <p>Discover the planned Frame BD membership experience.</p>
          </div>
          <Link className="button button-primary" href="/plans">
            Explore membership <Icon name="arrow" size={17} />
          </Link>
        </div>
        <ContentRow
          title="Top Rated"
          titles={filterCatalog({ sort: "rating" }).slice(0, 8)}
          href="/categories?sort=rating"
        />
        <ContentRow
          title="Popular TV Series"
          titles={filterCatalog({ type: "Series" })}
          href="/series"
        />
        <ContentRow
          title="Anime Collection"
          titles={filterCatalog({ type: "Anime" })}
          href="/anime"
        />
        <ContentRow
          title="Documentaries"
          subtitle="Real-world wonder, imagined for this preview"
          titles={filterCatalog({ type: "Documentary" })}
          href="/documentaries"
          wide
        />
        <ContentRow
          title="Short Films"
          titles={filterCatalog({ type: "Short" })}
          href="/shorts"
        />
        <ContentRow
          title="Free to Watch"
          titles={filterCatalog({ access: "Free" })}
          href="/categories?access=Free"
        />
        <ContentRow
          title="Premium Collection"
          titles={filterCatalog({ access: "Premium" }).slice(6, 14)}
          href="/categories?access=Premium"
        />
      </div>
    </>
  );
}
