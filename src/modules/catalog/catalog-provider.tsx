"use client";
import { createContext, useContext } from "react";
type CatalogNavigation = {
  hasDemo: boolean;
  genres: { name: string; count: number }[];
  categories: { slug: string; name: string; count: number }[];
};
const Context = createContext<CatalogNavigation>({
  hasDemo: false,
  genres: [],
  categories: [],
});
export function CatalogProvider({
  value,
  children,
}: {
  value: CatalogNavigation;
  children: React.ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useCatalog = () => useContext(Context);
