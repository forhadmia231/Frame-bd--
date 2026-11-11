"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "./api-client";
export function useResource<T>(path: string, identity: string, enabled = true) {
  const key = `${identity}:${path}`;
  const [revision, setRevision] = useState(0);
  const [record, setRecord] = useState<{
    key: string;
    data: T | null;
    error: string;
  }>({ key: "", data: null, error: "" });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiFetch<T>(path, { signal: controller.signal })
      .then((result) => setRecord({ key, data: result.data, error: "" }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setRecord({ key, data: null, error: error.message });
      });
    return () => controller.abort();
  }, [path, key, enabled, revision]);
  return {
    data: record.key === key ? record.data : null,
    error: record.key === key ? record.error : "",
    loading: enabled && record.key !== key,
    reload: () => setRevision((value) => value + 1),
  };
}
