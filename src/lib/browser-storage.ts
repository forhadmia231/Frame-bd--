"use client";
import { useSyncExternalStore } from "react";

const fallback = new Map<string, string>();
const eventName = "frame-bd:browser-storage";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(eventName, callback);
  };
}
export function useBrowserStorage(key: string, defaultValue: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      if (fallback.has(key)) return fallback.get(key)!;
      try {
        return localStorage.getItem(key) ?? defaultValue;
      } catch {
        return defaultValue;
      }
    },
    () => null,
  );
  return {
    value,
    ready: value !== null,
    write: (next: string) => {
      let persisted = true;
      try {
        localStorage.setItem(key, next);
        fallback.delete(key);
      } catch {
        persisted = false;
        fallback.set(key, next);
      }
      window.dispatchEvent(new Event(eventName));
      return persisted;
    },
  };
}
