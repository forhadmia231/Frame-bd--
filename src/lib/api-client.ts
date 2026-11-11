export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<{
  data: T;
  meta?: { total: number; page: number; pageSize: number };
}> {
  const response = await fetch(`/api/v1/${path}`, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error?.fields?.length
        ? result.error.fields
            .map(
              (v: { field: string; message: string }) =>
                `${v.field}: ${v.message}`,
            )
            .join("; ")
        : result.error?.message || "The request could not be completed.",
    );
  return result;
}
