"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCatalog } from "@/modules/catalog/catalog-provider";
import { authClient } from "@/lib/auth-client";
import { useWatchlist } from "@/modules/watchlist/watchlist-provider";
import { Icon } from "@/components/ui/icon";
import { useBrand } from "./site-chrome";

const links = [
  ["/", "Home"],
  ["/movies", "Movies"],
  ["/series", "Series"],
  ["/anime", "Anime"],
  ["/documentaries", "Documentaries"],
  ["/shorts", "Shorts"],
];
export function Logo() {
  const brand = useBrand();
  if (brand.logo || brand.name !== "Frame BD")
    return (
      <Link href="/" className="logo" aria-label={`${brand.name} home`}>
        {brand.logo && (
          <span
            className="custom-brand-image"
            style={{ backgroundImage: `url(${brand.logo})` }}
          />
        )}
        <span>{brand.name}</span>
      </Link>
    );
  return (
    <Link href="/" className="logo" aria-label="Frame BD home">
      <span className="logo-mark" aria-hidden="true">
        F<span />
      </span>
      <span>
        FRAME<span className="logo-bd">BD</span>
        <span className="logo-dot">.</span>
      </span>
    </Link>
  );
}
export function Navbar() {
  const { genres: genreEntries, hasDemo } = useCatalog();
  const genres = genreEntries.map((genre) => genre.name);
  const { data: session } = authClient.useSession();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const dropdown = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { saved } = useWatchlist();
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!dropdown.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Logo />
          <nav aria-label="Main navigation" className="desktop-nav">
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={path === href ? "active" : ""}
                aria-current={path === href ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
            <div
              ref={dropdown}
              className="category-dropdown"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false);
                  trigger.current?.focus();
                }
              }}
            >
              <button
                ref={trigger}
                className="nav-button"
                aria-expanded={open}
                aria-controls="genre-menu"
                onClick={() => setOpen(!open)}
              >
                Categories <Icon name="down" size={13} />
              </button>
              {open && (
                <div id="genre-menu" className="dropdown-panel">
                  <Link href="/categories" onClick={() => setOpen(false)}>
                    Explore all categories <Icon name="arrow" size={16} />
                  </Link>
                  <div>
                    {genres.map((genre) => (
                      <Link
                        href={`/categories?genre=${genre}`}
                        key={genre}
                        onClick={() => setOpen(false)}
                      >
                        {genre}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </nav>
          <div className="header-actions">
            <Link
              href="/search"
              className="icon-button"
              aria-label="Search titles"
            >
              <Icon name="search" />
            </Link>
            <Link
              href="/watchlist"
              className="header-watchlist"
              aria-label={`Watchlist, ${saved.length} saved titles`}
            >
              <Icon name="bookmark" size={18} />
              <span>My List</span>
              {saved.length > 0 && (
                <span className="count">{saved.length}</span>
              )}
            </Link>
            <Link
              href={session ? "/profile" : "/login"}
              className="button button-small sign-in"
            >
              {session ? "My Profile" : "Sign in"}{" "}
              <Icon name={session ? "user" : "arrow"} size={15} />
            </Link>
            <Link
              href="/profile"
              className="icon-button mobile-profile"
              aria-label="Profile"
            >
              <Icon name="user" />
            </Link>
          </div>
        </div>
      </header>
      <div className="demo-ribbon">
        <span className="live-dot" />{" "}
        {hasDemo
          ? "DEVELOPMENT CATALOG"
          : "FRAME BD"}{" "}
        <span className="ribbon-detail">
          {hasDemo
            ? "Fictional titles · PostgreSQL connected"
            : "Discover your next story"}
        </span>
        <Link href="/about">
          About this preview <Icon name="right" size={12} />
        </Link>
      </div>
    </>
  );
}
export function MobileBottomNav() {
  const path = usePathname();
  const items = [
    { href: "/", name: "Home", icon: "home" as const },
    { href: "/categories", name: "Explore", icon: "compass" as const },
    { href: "/watchlist", name: "Watchlist", icon: "bookmark" as const },
    { href: "/profile", name: "Profile", icon: "user" as const },
  ];
  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {items.map((item) => (
        <Link
          href={item.href}
          key={item.href}
          className={path === item.href ? "active" : ""}
          aria-current={path === item.href ? "page" : undefined}
        >
          <Icon name={item.icon} size={21} />
          <span>{item.name}</span>
        </Link>
      ))}
    </nav>
  );
}
