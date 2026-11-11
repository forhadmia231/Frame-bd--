"use client";
import { createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Navbar, MobileBottomNav } from "./navbar";
import { Footer } from "./footer";
type Brand = {
  name: string;
  logo: string;
  color: string;
  contact: string;
  social: string[];
  language: string;
  terms: string;
  privacy: string;
};
const Context = createContext<Brand>({
  name: "Frame BD",
  logo: "",
  color: "#e50914",
  contact: "",
  social: [],
  language: "English",
  terms: "",
  privacy: "",
});
export const useBrand = () => useContext(Context);
export function SiteChrome({
  children,
  brand,
}: {
  children: React.ReactNode;
  brand: Brand;
}) {
  const pathname = usePathname();
  return (
    <Context.Provider value={brand}>
      {pathname.startsWith("/admin") ? (
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      ) : (
        <>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <Navbar />
          <main id="main" className="min-w-0" tabIndex={-1}>
            {children}
          </main>
          <div className="container platform-links">
            {brand.contact && (
              <a href={`mailto:${brand.contact}`}>{brand.contact}</a>
            )}
            {brand.social.map((href, i) => (
              <a
                key={href}
                href={href}
                rel="noopener noreferrer"
                target="_blank"
              >
                Social {i + 1} ↗
              </a>
            ))}
            {brand.terms && <Link href={brand.terms}>Terms</Link>}
            {brand.privacy && <Link href={brand.privacy}>Privacy</Link>}
            <span>Language: {brand.language}</span>
          </div>
          <Footer />
          <MobileBottomNav />
        </>
      )}
    </Context.Provider>
  );
}
