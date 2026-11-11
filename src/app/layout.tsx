import type { Metadata } from "next";
import "./globals.css";
import { SiteChrome } from "@/components/layout/site-chrome";
import { platformSettings } from "@/modules/admin/platform";
import { headers } from "next/headers";
import { WatchlistProvider } from "@/modules/watchlist/watchlist-provider";
import { CatalogProvider } from "@/modules/catalog/catalog-provider";
import { catalogNavigation } from "@/modules/catalog/service";
export const dynamic = "force-dynamic";

const defaultMetadata: Metadata = {
  title: {
    default: "Frame BD — A story for every mood",
    template: "%s | Frame BD",
  },
  description:
    "Discover movies, series and anime with Frame BD. The development catalog contains clearly marked fictional titles.",
};
export async function generateMetadata(): Promise<Metadata> {
  const brand = await platformSettings();
  return {
    ...defaultMetadata,
    title: { default: brand.seoTitle, template: `%s | ${brand.name}` },
    description: brand.seoDescription,
    ...(brand.favicon ? { icons: { icon: brand.favicon } } : {}),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [catalog, brand] = await Promise.all([catalogNavigation(), platformSettings()]);
  const pathname = (await headers()).get("x-frame-path") || "/";
  const maintenance =
    brand.maintenance &&
    ![
      "/admin",
      "/login",
      "/forgot-password",
      "/reset-password",
      "/access-denied",
    ].some((p) => pathname.startsWith(p));
  return (
    <html
      lang={brand.language.toLowerCase() === "bangla" ? "bn" : "en"}
      data-scroll-behavior="smooth"
    >
      {/* Browser extensions may add body attributes before React hydrates.
          Suppress only this element's mismatch; descendants remain checked. */}
      <body suppressHydrationWarning style={{ "--red": brand.color } as React.CSSProperties}>
        <CatalogProvider value={catalog}>
          <WatchlistProvider>
            <SiteChrome brand={brand}>
              {maintenance ? (
                <section className="container page-content">
                  <h1>We will be back soon.</h1>
                  <p>{brand.name} is undergoing scheduled maintenance.</p>
                </section>
              ) : (
                children
              )}
            </SiteChrome>
          </WatchlistProvider>
        </CatalogProvider>
      </body>
    </html>
  );
}
