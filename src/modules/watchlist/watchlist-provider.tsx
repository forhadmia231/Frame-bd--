"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useBrowserStorage } from "@/lib/browser-storage";
import { authClient } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api-client";
import type { CatalogTitle } from "@/types/catalog";

type ContextValue = {
  saved: string[];
  titles: CatalogTitle[];
  ready: boolean;
  scope: "account" | "browser";
  error: string;
  toggle: (slug: string) => void;
  clear: () => void;
  message: string;
};
const Context = createContext<ContextValue | null>(null);
export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const storage = useBrowserStorage("frame-bd:demo-watchlist:v1", "[]");
  const { data: session, isPending } = authClient.useSession();
  const owner = session?.user.id || "guest";
  const guestSaved = useMemo(() => {
    try {
      const raw: unknown = JSON.parse(storage.value || "[]");
      return Array.isArray(raw)
        ? [
            ...new Set(
              raw.filter(
                (slug): slug is string =>
                  typeof slug === "string" && /^[a-z0-9-]{1,150}$/.test(slug),
              ),
            ),
          ].slice(0, 200)
        : [];
    } catch {
      return [];
    }
  }, [storage.value]);
  const [record, setRecord] = useState<{
    key: string;
    items: CatalogTitle[];
    error: string;
  }>({ key: "", items: [], error: "" });
  const [message, setMessage] = useState("");
  const guestKey = JSON.stringify(guestSaved);
  const key = owner === "guest" ? `guest:${guestKey}` : owner;
  useEffect(() => {
    if (isPending || !storage.ready) return;
    const controller = new AbortController();
    const load =
      owner === "guest"
        ? guestKey === "[]"
          ? Promise.resolve([])
          : apiFetch<CatalogTitle[]>("catalog/lookup", {
              method: "POST",
              body: JSON.stringify({ slugs: JSON.parse(guestKey) }),
              signal: controller.signal,
            }).then((result) => result.data)
        : apiFetch<CatalogTitle[]>("me/watchlist", {
            signal: controller.signal,
          }).then((result) => result.data);
    load
      .then((items) => {
        if (!controller.signal.aborted) setRecord({ key, items, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setRecord({ key, items: [], error: error.message });
      });
    return () => controller.abort();
  }, [owner, key, guestKey, isPending, storage.ready]);
  const titles = record.key === key ? record.items : [];
  const saved =
    owner === "guest" ? guestSaved : titles.map((title) => title.slug);
  async function toggle(slug: string) {
    try {
      if (owner === "guest") {
        const next = saved.includes(slug)
          ? saved.filter((value) => value !== slug)
          : [...saved, slug];
        const persisted = storage.write(JSON.stringify(next));
        setMessage(
          `${next.includes(slug) ? "Added to" : "Removed from"} your browser watchlist.${persisted ? "" : " Changes last for this visit only."}`,
        );
      } else {
        const removed = saved.includes(slug);
        await apiFetch(removed ? `me/watchlist/${slug}` : "me/watchlist", {
          method: removed ? "DELETE" : "POST",
          ...(removed ? {} : { body: JSON.stringify({ slug }) }),
        });
        const response = await apiFetch<CatalogTitle[]>("me/watchlist");
        setRecord({ key, items: response.data, error: "" });
        setMessage(
          removed
            ? "Removed from your account watchlist."
            : "Saved to your account watchlist.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Watchlist could not be updated.",
      );
    }
  }
  async function clear() {
    try {
      if (owner === "guest") {
        const persisted = storage.write("[]");
        setMessage(
          persisted
            ? "Browser watchlist cleared."
            : "List cleared for this visit; browser storage is unavailable.",
        );
      } else {
        await apiFetch("me/watchlist", { method: "DELETE" });
        setRecord({ key, items: [], error: "" });
        setMessage("Account watchlist cleared.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Watchlist could not be cleared.",
      );
    }
  }
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4500);
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <Context.Provider
      value={{
        saved,
        titles,
        ready: !isPending && storage.ready && record.key === key,
        scope: owner === "guest" ? "browser" : "account",
        error: record.key === key ? record.error : "",
        toggle: (slug) => {
          void toggle(slug);
        },
        clear: () => {
          void clear();
        },
        message,
      }}
    >
      {children}
      <div
        className={`toast ${message ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>
    </Context.Provider>
  );
}
export function useWatchlist() {
  const value = useContext(Context);
  if (!value) throw new Error("WatchlistProvider required");
  return value;
}
