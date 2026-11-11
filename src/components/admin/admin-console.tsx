"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { navigation, fields, type Field } from "@/modules/admin/ui-config";
import { LogoutButton } from "@/components/account/logout-button";
import { StreamingAdmin } from "./streaming-admin";
import { PaymentMethods } from "./payment-methods";
type Row = Record<string, unknown>;
type Option = { id: string; label: string; seasonId?: string; number?: number };
type Options = Record<string, Option[]>;
type Report = {
  days: number;
  stats: Record<string, number>;
  charts: Record<string, { date: string; value: number }[]>;
  registrations: Row[];
  activity: Row[];
  mostWatched: { name: string; value: number }[];
  categories: { name: string; value: number }[];
};
const request = <T,>(path: string, method = "GET", data?: unknown) =>
  apiFetch<T>(`admin/${path}`, {
    method,
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  }).then((r) => r.data);
function text(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value))
    return value.length ? value.map(text).join(", ") : "—";
  if (typeof value === "object") {
    const obj = value as Row;
    return text(
      obj.name ||
        obj.title ||
        obj.slug ||
        obj.email ||
        obj.status ||
        JSON.stringify(obj),
    );
  }
  return String(value);
}
function initial(resource: string, row: Row): Row {
  const out: Row = {};
  for (const field of fields[resource] || [])
    out[field.key] =
      row[field.key] ??
      field.value ??
      (field.type === "checkbox"
        ? false
        : field.type === "multi" || field.type === "list"
          ? []
          : "");
  if (resource === "content") {
    out.genreIds = ((row.genres as Row[]) || []).map((v) => v.genreId);
    out.categoryIds = ((row.categories as Row[]) || []).map(
      (v) => v.categoryId,
    );
    out.languages = ((row.languages as Row[]) || []).map((v) => v.language);
    out.cast = ((row.cast as Row[]) || []).map((v) => (v.person as Row).name);
    out.director = text(
      ((row.crew as Row[]) || []).find((v) => v.job === "Director")?.person,
    );
    if (out.director === "—") out.director = "";
    out.subtitleLanguages = [
      ...new Set(((row.subtitles as Row[]) || []).map((v) => v.language)),
    ];
  }
  if (resource === "sections")
    out.contentIds = ((row.items as Row[]) || []).map((v) => v.contentId);
  return out;
}
function Input({
  field,
  value,
  onChange,
  options,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  options: Options;
}) {
  const id = `admin-${field.key}`;
  return (
    <label htmlFor={id} className={field.type === "textarea" ? "span-two" : ""}>
      <span>{field.label}</span>
      {field.type === "textarea" ? (
        <textarea
          id={id}
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      ) : field.type === "checkbox" ? (
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      ) : field.type === "multi" || field.type === "select" ? (
        <>
          <select
            id={id}
            multiple={field.type === "multi"}
            value={
              field.type === "multi" ? (value as string[]) : String(value || "")
            }
            onChange={(e) =>
              onChange(
                field.type === "multi"
                  ? Array.from(e.target.selectedOptions, (o) => o.value)
                  : e.target.value,
              )
            }
          >
            {field.type === "select" && <option value="">Select…</option>}
            {(field.lookup
              ? options[field.lookup] || []
              : (field.options || []).map((v) => ({ id: v, label: v }))
            ).map((option) => (
              <option value={option.id} key={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {field.type === "multi" && (
            <small>
              Ctrl/Cmd selects multiple. Selected order:{" "}
              {text(
                (value as string[]).map(
                  (v) =>
                    options[field.lookup!]?.find((o) => o.id === v)?.label || v,
                ),
              )}
            </small>
          )}
          {field.type === "multi" &&
            field.key === "contentIds" &&
            (value as string[]).map((selected, index) => (
              <span key={selected} className="admin-order-item">
                {options[field.lookup!]?.find((o) => o.id === selected)
                  ?.label || selected}
                <button
                  type="button"
                  aria-label={`Move selected title ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => {
                    const next = [...(value as string[])];
                    [next[index - 1], next[index]] = [
                      next[index],
                      next[index - 1],
                    ];
                    onChange(next);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move selected title ${index + 1} down`}
                  disabled={index === (value as string[]).length - 1}
                  onClick={() => {
                    const next = [...(value as string[])];
                    [next[index + 1], next[index]] = [
                      next[index],
                      next[index + 1],
                    ];
                    onChange(next);
                  }}
                >
                  ↓
                </button>
              </span>
            ))}
        </>
      ) : (
        <input
          id={id}
          type={
            field.type === "number"
              ? "number"
              : field.type === "date"
                ? "datetime-local"
                : "text"
          }
          step={field.key === "editorialRating" ? "0.1" : undefined}
          value={
            field.type === "list"
              ? (value as string[]).join(", ")
              : field.type === "date"
                ? String(value || "").slice(0, 16)
                : String(value ?? "")
          }
          onChange={(e) =>
            onChange(
              field.type === "number"
                ? Number(e.target.value)
                : field.type === "list"
                  ? e.target.value.split(",").map((s) => s.trim())
                  : e.target.value,
            )
          }
        />
      )}{" "}
      {field.help && <small>{field.help}</small>}
    </label>
  );
}
export function AdminConsole({
  user,
  resource = "",
  recordId,
}: {
  user: { id: string; name: string; role: string };
  resource?: string;
  recordId?: string;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("newest"),
    [type, setType] = useState(""),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(1),
    [version, setVersion] = useState(0),
    [data, setData] = useState<{
      items: Row[];
      total: number;
      pageSize: number;
    } | null>(null),
    [report, setReport] = useState<Report | null>(null),
    [days, setDays] = useState(30),
    [options, setOptions] = useState<Options>({}),
    [values, setValues] = useState<Row>({}),
    [detail, setDetail] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [pending, setPending] = useState(false),
    [confirmation, setConfirmation] = useState<null | {
      title: string;
      run: () => Promise<unknown>;
    }>(null);
  const key = resource === "series" ? "content" : resource;
  const heading =
    navigation.find((n) => n[0] === resource)?.[1] ||
    resource.replaceAll("-", " ");
  const editor = recordId === "new" || Boolean(recordId && fields[key]);
  const needsOptions =
    (!recordId && ["media", "episodes"].includes(key)) ||
    (editor && Boolean(fields[key]?.some((field) => field.lookup)));
  const settings = key === "settings";
  const readOnly = [
    "users",
    "subscriptions",
    "payments",
    "logs",
    "media",
  ].includes(key);
  const canWrite =
    !["plans", "coupons", "settings"].includes(key) ||
    user.role === "SUPER_ADMIN";
  useEffect(() => {
    if (!needsOptions) return;
    let active = true;
    request<Options>("options")
      .then((v) => {
        if (active) setOptions(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [version, needsOptions]);
  useEffect(() => {
    let active = true;
    const run = async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      setError("");
      setData(null);
      setDetail(null);
      setReport(null);
      if (key === "payment-methods") {
        // This section loads and saves its own configuration.
      } else if (!key || key === "analytics") {
        const result = await request<Report>(`overview?days=${days}`);
        if (active) setReport(result);
      } else if (settings) {
        const result = await request<Row>("settings");
        if (active) setValues(initial("settings", result));
      } else if (recordId) {
        const row =
          recordId === "new" ? {} : await request<Row>(`${key}/${recordId}`);
        if (active) {
          setValues(initial(key, row));
          setDetail(row);
        }
      } else {
        const result = await request<{
          items: Row[];
          total: number;
          pageSize: number;
        }>(
          `${key}?${new URLSearchParams({ q, status, page: String(page), sort, type: resource === "series" ? "series" : type })}`,
        );
        if (active) setData(result);
      }
    };
    run()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    key,
    resource,
    recordId,
    q,
    status,
    page,
    sort,
    type,
    version,
    days,
    settings,
  ]);
  async function perform(
    action: () => Promise<unknown>,
    message = "Changes saved.",
  ) {
    setPending(true);
    setError("");
    try {
      await action();
      setToast(message);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setPending(false);
      setConfirmation(null);
    }
  }
  const links = navigation.filter(
    (n) => !["settings", "payment-methods"].includes(n[0]) || user.role === "SUPER_ADMIN",
  );
  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${menu ? "is-open" : ""}`}>
        <Link href="/admin" className="admin-brand">
          <span>F</span> FRAME<span className="red">BD.</span>
        </Link>
        <p className="admin-caption">WORKSPACE / ADMINISTRATION</p>
        <nav aria-label="Administration">
          {links.map(([path, title, icon]) => (
            <Link
              key={path}
              href={`/admin${path ? "/" + path : ""}`}
              onClick={() => {
                setMenu(false);
                setPage(1);
                setQ("");
                setStatus("");
              }}
              className={resource === path ? "selected" : ""}
            >
              <span aria-hidden>{icon}</span>
              {title}
              {path === "content" && <small>CMS</small>}
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <Link href="/">↗ Open Frame BD</Link>
          <p>Signed in as {user.role.replaceAll("_", " ")}</p>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <button
            className="admin-menu"
            aria-label="Toggle admin menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
          <span>
            <b>Workspace</b>{" "}
            <span className="muted"> / {heading || "Overview"}</span>
          </span>
          <div>
            <span className="admin-avatar">{user.name.slice(0, 1)}</span>
            <span>
              {user.name}
              <small>{user.role.replaceAll("_", " ")}</small>
            </span>
            <LogoutButton />
          </div>
        </header>
        <div className="admin-body">
          <div className="admin-page-heading">
            <div>
              <p className="admin-caption">FRAME BD CONTROL CENTER</p>
              <h1>
                {heading || "Overview"}
                <span className="red">.</span>
              </h1>
              <p className="muted">
                {!key
                  ? "Your platform at a glance. Live database information."
                  : key === "media"
                    ? "Manage authorized images, subtitles and private video originals."
                    : key === "payments"
                      ? "Provider-verified records. Payment states cannot be edited."
                      : "Manage your platform with changes recorded in the audit trail."}
              </p>
            </div>
            <div className="admin-heading-actions">
              {key === "payments" && user.role === "SUPER_ADMIN" && <Link className="admin-button primary" href="/admin/payment-methods">Manage payment methods</Link>}
              {recordId && (
                <Link className="admin-button" href={`/admin/${resource}`}>
                  ← Back to list
                </Link>
              )}
              {!recordId &&
                fields[key] &&
                !settings &&
                !readOnly &&
                canWrite && (
                  <Link
                    className="admin-button primary"
                    href={`/admin/${key}/new`}
                  >
                    ＋ Add{" "}
                    {key === "content" ? "content" : key.replace(/s$/, "")}
                  </Link>
                )}
              <button
                className="admin-button"
                disabled={pending}
                onClick={() => setVersion((v) => v + 1)}
              >
                ↻ Refresh
              </button>
            </div>
          </div>
          {toast && (
            <div className="admin-toast" role="status">
              ✓ {toast}
              <button
                aria-label="Dismiss notification"
                onClick={() => setToast("")}
              >
                ×
              </button>
            </div>
          )}
          {key === "payment-methods" && user.role === "SUPER_ADMIN" && <PaymentMethods refresh={version} />}
          {error && (
            <div className="admin-error" role="alert">
              {error}
            </div>
          )}
          {(!key || key === "analytics") && (
            <>
              <div className="admin-toolbar">
                <span className="admin-live">● Database connected</span>
                <label>
                  Date range{" "}
                  <select
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                    <option value={365}>Last year</option>
                  </select>
                </label>
                <span className="muted">
                  UTC · totals are lifetime unless labelled
                </span>
              </div>
              {report ? (
                <>
                  <div className="admin-stats">
                    {Object.entries(report.stats).map(([label, value], i) => (
                      <article key={label}>
                        <span className="stat-icon" aria-hidden>
                          {["◎", "↗", "◈", "▤"][i % 4]}
                        </span>
                        <p>{label}</p>
                        <strong>{value.toLocaleString()}</strong>
                        <small>Live database</small>
                      </article>
                    ))}
                  </div>
                  <div className="admin-charts">
                    {Object.entries(report.charts).map(([label, points]) => (
                      <Chart key={label} label={label} points={points} />
                    ))}
                  </div>
                  <div className="admin-columns">
                    <Panel
                      title="Recent registrations"
                      rows={report.registrations}
                      keys={["name", "email", "createdAt"]}
                    />
                    <Panel
                      title="Recent activity"
                      rows={report.activity}
                      keys={["action", "user", "createdAt"]}
                    />
                    <Panel
                      title="Most watched · distinct saved history entries"
                      rows={report.mostWatched}
                      keys={["name", "value"]}
                    />
                    <Panel
                      title="Popular categories · history entries"
                      rows={report.categories}
                      keys={["name", "value"]}
                    />
                  </div>
                  <p className="admin-note">
                    No streaming telemetry is connected. Saved positions are a
                    progress snapshot, not measured watch time. Repeat
                    purchasers are not confirmed automatic renewals. Empty
                    charts mean no matching records.
                  </p>
                </>
              ) : (
                !error && <p role="status">Loading platform metrics…</p>
              )}
            </>
          )}
          {(editor || settings) && canWrite && (
            <form
              className="admin-panel admin-editor"
              onSubmit={(e) => {
                e.preventDefault();
                const cleaned = { ...values };
                for (const field of fields[key]) {
                  if (field.type === "date")
                    cleaned[field.key] = values[field.key]
                      ? new Date(String(values[field.key]) + "Z").toISOString()
                      : null;
                  if (field.type === "list")
                    cleaned[field.key] = (values[field.key] as string[])
                      .map((v) => v.trim())
                      .filter(Boolean);
                }
                if (key === "content" && !cleaned.backdropPath)
                  cleaned.backdropPath = null;
                if (["assets", "subtitles"].includes(key) && !cleaned.episodeId)
                  cleaned.episodeId = null;
                perform(async () => {
                  await request(
                    settings
                      ? "settings"
                      : `${key}${recordId === "new" ? "" : "/" + recordId}`,
                    settings || recordId !== "new" ? "PATCH" : "POST",
                    cleaned,
                  );
                  if (!settings) router.push(`/admin/${key}`);
                });
              }}
            >
              <div className="admin-panel-heading">
                <h2>
                  {settings
                    ? "Brand & platform"
                    : recordId === "new"
                      ? "Create record"
                      : "Edit record"}
                </h2>
                <span className="muted">Validated on the server</span>
              </div>
              <div className="admin-form-grid">
                {(fields[key] || []).map((field) => (
                  <Input
                    key={field.key}
                    field={field}
                    value={
                      values[field.key] ??
                      field.value ??
                      (field.type === "multi" || field.type === "list"
                        ? []
                        : "")
                    }
                    onChange={(v) =>
                      setValues((old) => ({ ...old, [field.key]: v }))
                    }
                    options={options}
                  />
                ))}
              </div>
              <div className="admin-form-footer">
                <p>
                  Changes apply to the live database. Publication time is UTC.
                </p>
                <button
                  className="admin-button primary"
                  disabled={pending || loading}
                  type="submit"
                >
                  {pending ? "Saving…" : loading ? "Loading…" : "Save changes"}
                </button>
              </div>
            </form>
          )}
          {key === "media" && !recordId && (
            <StreamingAdmin
              options={options}
              revision={version}
              onDone={() => setVersion((v) => v + 1)}
            />
          )}
          {key === "media" && !recordId && (
            <MediaTools
              pending={pending}
              onAction={perform}
              options={options}
            />
          )}
          {resource === "series" && !recordId && (
            <div className="admin-heading-actions admin-extra">
              <Link className="admin-button" href="/admin/seasons">
                Manage seasons
              </Link>
              <Link className="admin-button" href="/admin/episodes">
                Manage episodes
              </Link>
              <Link className="admin-button" href="/admin/assets">
                Attach authorized videos
              </Link>
              <Link className="admin-button" href="/admin/subtitles">
                Attach subtitles
              </Link>
            </div>
          )}
          {key === "episodes" && !recordId && (
            <Reorder options={options} perform={perform} />
          )}
          {!recordId && !settings && key && !["analytics", "payment-methods"].includes(key) && (
            <>
              <div className="admin-toolbar">
                <label className="admin-search">
                  ⌕{" "}
                  <input
                    aria-label="Search records"
                    placeholder="Search records…"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                {["content", "users", "subscriptions", "payments"].includes(
                  key,
                ) && (
                  <select
                    aria-label="Filter status"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All statuses / roles</option>
                    {(key === "users"
                      ? ["USER", "ADMIN", "SUPER_ADMIN"]
                      : key === "subscriptions"
                        ? [
                            "PENDING",
                            "ACTIVE",
                            "EXPIRED",
                            "CANCELLED",
                            "REVOKED",
                          ]
                        : key === "payments"
                          ? ["PENDING", "VERIFIED", "FAILED", "REFUNDED"]
                          : ["DRAFT", "PUBLISHED", "ARCHIVED"]
                    ).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                )}
                <select
                  aria-label="Sort records"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
                {key === "content" && resource !== "series" && (
                  <select
                    aria-label="Filter content type"
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All content types</option>
                    {[
                      "MOVIE",
                      "TV_SERIES",
                      "WEB_SERIES",
                      "ANIME",
                      "DOCUMENTARY",
                      "SHORT_FILM",
                      "SHORT",
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="admin-panel admin-table-wrap">
                {data ? (
                  <>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Record</th>
                          <th>Details</th>
                          <th>Status</th>
                          <th>Created</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((row) => (
                          <tr key={String(row.id)}>
                            <td>
                              <strong>
                                {text(
                                  row.title ||
                                    row.name ||
                                    row.code ||
                                    row.action ||
                                    row.provider ||
                                    row.id,
                                )}
                              </strong>
                              <small>
                                {text(
                                  row.slug ||
                                    row.email ||
                                    row.userId ||
                                    row.contentId ||
                                    row.resourceId,
                                )}
                              </small>
                            </td>
                            <td>
                              {text(
                                row.membership ||
                                  row.type ||
                                  row.kind ||
                                  row.providerReference ||
                                  row.plan ||
                                  (row.percent && `${row.percent}%`) ||
                                  row.value ||
                                  (row.number && `Number ${row.number}`),
                              )}
                              {row.amount !== undefined && (
                                <small>
                                  {text(row.currency)}{" "}
                                  {Number(row.amount) / 100}
                                </small>
                              )}
                              {row.price !== undefined && (
                                <small>
                                  {text(row.currency)} {Number(row.price) / 100}
                                </small>
                              )}
                              {row.path !== undefined && (
                                <code>{text(row.path)}</code>
                              )}
                            </td>
                            <td>
                              <span
                                className={`admin-badge ${["PUBLISHED", "VERIFIED", "READY", "ACTIVE"].includes(String(row.status)) ? "positive" : ""}`}
                              >
                                {text(
                                  row.status ||
                                    row.role ||
                                    (row.active !== undefined
                                      ? row.active
                                        ? "Enabled"
                                        : "Disabled"
                                      : row.readAt
                                        ? "Read"
                                        : "Recorded"),
                                )}
                              </span>
                              {row.suspendedAt ? (
                                <small className="red">Suspended</small>
                              ) : null}
                              {row.publishedAt &&
                              new Date(String(row.publishedAt)) > new Date() ? (
                                <small>Scheduled</small>
                              ) : null}
                            </td>
                            <td>{String(row.createdAt || "").slice(0, 10)}</td>
                            <td>
                              <div className="admin-row-actions">
                                {key === "media" &&
                                  row.kind === "VIDEO" &&
                                  row.status === "UPLOADING" && (
                                    <button
                                      className="admin-button danger small"
                                      onClick={() =>
                                        perform(async () => {
                                          const response = await fetch(
                                            `/api/stream/uploads/${row.id}`,
                                            { method: "DELETE" },
                                          );
                                          const result = await response.json();
                                          if (!response.ok)
                                            throw new Error(
                                              result.error?.message ||
                                                "Abort failed.",
                                            );
                                        }, "Multipart upload aborted.")
                                      }
                                    >
                                      Abort upload
                                    </button>
                                  )}
                                {(fields[key] ||
                                  [
                                    "users",
                                    "payments",
                                    "subscriptions",
                                    "logs",
                                  ].includes(key)) && (
                                  <Link
                                    className="admin-button small"
                                    href={`/admin/${key}/${row.id}`}
                                  >
                                    {key === "media"
                                      ? "Edit metadata"
                                      : readOnly
                                        ? "View"
                                        : "Edit"}
                                  </Link>
                                )}
                                {key === "content" &&
                                  row.status === "PUBLISHED" && (
                                    <Link
                                      className="admin-button small"
                                      href={`/titles/${row.slug}`}
                                    >
                                      Public page ↗
                                    </Link>
                                  )}
                                {key === "media" &&
                                  row.status === "PENDING" && (
                                    <button
                                      className="admin-button small"
                                      onClick={() =>
                                        perform(() =>
                                          request(
                                            `media/${row.id}/complete`,
                                            "POST",
                                            {},
                                          ),
                                        )
                                      }
                                    >
                                      Verify upload
                                    </button>
                                  )}
                                {(!readOnly || key === "media") && canWrite && (
                                  <button
                                    className="admin-button danger small"
                                    onClick={() =>
                                      setConfirmation({
                                        title: `Delete ${text(row.title || row.name || row.code || row.id)}? Referenced records are protected. This cannot be undone.`,
                                        run: () =>
                                          request(`${key}/${row.id}`, "DELETE"),
                                      })
                                    }
                                  >
                                    Delete
                                  </button>
                                )}
                                {key === "notifications" &&
                                  row.userId === user.id &&
                                  !row.readAt && (
                                    <button
                                      className="admin-button small"
                                      onClick={() =>
                                        perform(() =>
                                          request(
                                            `notifications/${row.id}/read`,
                                            "POST",
                                            {},
                                          ),
                                        )
                                      }
                                    >
                                      Mark read
                                    </button>
                                  )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!data.items.length && (
                      <div className="admin-empty">
                        <span>◇</span>
                        <h3>No matching records</h3>
                        <p>Change the search or add your first record.</p>
                      </div>
                    )}
                    <div className="admin-pagination">
                      <span>
                        {data.total} records · Page {page} of{" "}
                        {Math.max(1, Math.ceil(data.total / 20))}
                      </span>
                      <div>
                        <button
                          className="admin-button small"
                          disabled={page === 1}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          Previous
                        </button>
                        <button
                          className="admin-button small"
                          disabled={page * 20 >= data.total}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  !error && (
                    <p className="admin-empty" role="status">
                      Loading records…
                    </p>
                  )
                )}
              </div>
            </>
          )}
          {recordId && !editor && detail && (
            <>
              <section className="admin-panel admin-detail">
                <h2>Record details</h2>
                {Object.entries(detail).map(([k, v]) => (
                  <div key={k}>
                    <b>{k}</b>
                    <pre>
                      {typeof v === "object"
                        ? JSON.stringify(v, null, 2)
                        : text(v)}
                    </pre>
                  </div>
                ))}
              </section>
              {key === "users" && (
                <div className="admin-panel admin-detail">
                  <h2>Account access</h2>
                  <p>
                    Changes revoke all sessions. Your own account and the last
                    active Super Admin are protected.
                  </p>
                  <button
                    className="admin-button danger"
                    disabled={pending || recordId === user.id}
                    onClick={() =>
                      setConfirmation({
                        title: `${detail.suspendedAt ? "Reactivate" : "Suspend"} this account and revoke its sessions?`,
                        run: () =>
                          request(`users/${recordId}`, "PATCH", {
                            suspended: !detail.suspendedAt,
                          }),
                      })
                    }
                  >
                    {detail.suspendedAt ? "Reactivate" : "Suspend"} account
                  </button>
                  {user.role === "SUPER_ADMIN" && (
                    <label>
                      Administrative role{" "}
                      <select
                        aria-label="Administrative role"
                        defaultValue={String(detail.role)}
                        disabled={recordId === user.id || pending}
                        onChange={(e) => {
                          const role = e.target.value;
                          setConfirmation({
                            title: `Change administrative role to ${role}? Sessions will be revoked.`,
                            run: () =>
                              request(`users/${recordId}`, "PATCH", { role }),
                          });
                        }}
                      >
                        {["USER", "ADMIN", "SUPER_ADMIN"].map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <footer className="admin-footer">
          Frame BD administration{" "}
          <span>Private workspace · Provider-verified billing only</span>
        </footer>
      </div>
      {confirmation && (
        <div className="admin-modal-backdrop">
          <section
            className="admin-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title">Confirm action</h2>
            <p>{confirmation.title}</p>
            <div>
              <button
                autoFocus
                className="admin-button"
                disabled={pending}
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
              <button
                className="admin-button danger"
                disabled={pending}
                onClick={() => perform(confirmation.run, "Action completed.")}
              >
                {pending ? "Working…" : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Chart({
  label,
  points,
}: {
  label: string;
  points: { date: string; value: number }[];
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <section className="admin-panel admin-chart">
      <div className="admin-panel-heading">
        <h2>{label}</h2>
        <span className="admin-live">UTC</span>
      </div>
      {points.length ? (
        <>
          <div
            className="admin-bars"
            role="img"
            aria-label={`${label}: ${points.map((p) => `${p.date}: ${p.value}`).join("; ")}`}
          >
            {points.map((p, i) => (
              <div
                key={p.date}
                title={`${p.date}: ${p.value}`}
                style={{ height: `${Math.max(2, (p.value / max) * 100)}%` }}
              >
                <span>{p.value}</span>
                <small>
                  {points.length < 12 || i === 0 || i === points.length - 1
                    ? p.date.slice(5)
                    : ""}
                </small>
              </div>
            ))}
          </div>
          <p className="muted">
            Total: {points.reduce((n, p) => n + p.value, 0).toLocaleString()} ·{" "}
            {points[0].date} — {points.at(-1)?.date}
          </p>
        </>
      ) : (
        <div className="admin-chart-empty">
          <span>⌁</span>
          <p>No recorded activity in this range.</p>
        </div>
      )}
    </section>
  );
}
function Panel({
  title,
  rows,
  keys,
}: {
  title: string;
  rows: Row[];
  keys: string[];
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <h2>{title}</h2>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {keys.map((key) => (
                  <td key={key}>{text(row[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="admin-empty">No recorded activity.</p>}
      </div>
    </section>
  );
}
function MediaTools({
  onAction,
  pending,
  options,
}: {
  onAction: (f: () => Promise<unknown>, m?: string) => Promise<void>;
  pending: boolean;
  options: Options;
}) {
  const [kind, setKind] = useState("IMAGE"),
    [file, setFile] = useState<File | null>(null),
    [authorized, setAuthorized] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="admin-panel admin-upload">
      <div>
        <h2>Upload media</h2>
        <p>
          Images ≤8 MB · WebVTT ≤1 MB · Private video originals ≤2 GB via signed
          direct storage upload.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return;
          onAction(async () => {
            if (kind === "VIDEO") {
              if (!authorized)
                throw new Error("Confirm that you have rights to this video.");
              const signed = await request<{ id: string; url: string }>(
                "video-upload",
                "POST",
                {
                  name: file.name,
                  bytes: file.size,
                  mime: file.type,
                  authorized: true,
                },
              );
              const result = await fetch(signed.url, {
                method: "PUT",
                headers: { "Content-Type": file.type },
                body: file,
              });
              if (!result.ok)
                throw new Error(
                  "Storage upload failed. Check provider CORS and retry.",
                );
              await request(`media/${signed.id}/complete`, "POST", {});
              setMessage(
                `Private upload ${signed.id} verified. Attach it to content using Authorized video references.`,
              );
            } else {
              const result = await fetch(`/api/v1/admin/upload?kind=${kind}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/octet-stream",
                  "x-file-name": file.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
                },
                body: file,
              });
              const json = await result.json();
              if (!result.ok)
                throw new Error(json.error?.message || "Upload failed.");
              setMessage(
                json.data.path ||
                  `Subtitle upload ${json.data.id} ready. Attach it using Subtitle references.`,
              );
            }
          }, "Upload completed.");
        }}
      >
        <label>
          Media type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="IMAGE">Poster / backdrop / thumbnail</option>
            <option value="SUBTITLE">WebVTT subtitles</option>
          </select>
        </label>
        <label>
          Choose file
          <input
            type="file"
            accept={
              kind === "IMAGE"
                ? "image/png,image/jpeg,image/webp"
                : kind === "SUBTITLE"
                  ? ".vtt,.srt"
                  : "video/mp4,video/webm,video/quicktime"
            }
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        {kind === "VIDEO" && (
          <label>
            <input
              type="checkbox"
              checked={authorized}
              onChange={(e) => setAuthorized(e.target.checked)}
            />
            I confirm Frame BD has rights to this video
          </label>
        )}
        <button className="admin-button primary" disabled={!file || pending}>
          Upload & verify
        </button>
      </form>
      <p role="status">
        <code>{message}</code>
      </p>
      <div className="admin-heading-actions">
        <Link className="admin-button" href="/admin/assets">
          Authorized video references ({options.videos?.length || 0} ready)
        </Link>
        <Link className="admin-button" href="/admin/subtitles">
          Subtitle references
        </Link>
      </div>
    </section>
  );
}
function Reorder({
  options,
  perform,
}: {
  options: Options;
  perform: (f: () => Promise<unknown>, m?: string) => Promise<void>;
}) {
  const [season, setSeason] = useState(""),
    [ids, setIds] = useState<string[]>([]);
  return (
    <form
      className="admin-panel admin-reorder"
      onSubmit={(e) => {
        e.preventDefault();
        perform(() =>
          request(`episodes/${season}/reorder`, "POST", {
            ids,
          }),
        );
      }}
    >
      <h2>Reorder episodes</h2>
      <p>
        Use the arrows to set the new episode order. Titles with viewing history
        require a dedicated migration and cannot be renumbered here.
      </p>
      <label>
        Season
        <select
          required
          value={season}
          onChange={(e) => {
            setSeason(e.target.value);
            setIds(
              (options.episodes || [])
                .filter((v) => v.seasonId === e.target.value)
                .sort((a, b) => (a.number || 0) - (b.number || 0))
                .map((v) => v.id),
            );
          }}
        >
          <option value="">Choose season</option>
          {(options.seasons || []).map((s) => (
            <option value={s.id} key={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {ids.map((id, index) => (
        <div className="admin-order-item" key={id}>
          <span>
            {index + 1}. {options.episodes?.find((v) => v.id === id)?.label}
          </span>
          <button
            type="button"
            className="admin-button small"
            aria-label={`Move episode ${index + 1} up`}
            disabled={index === 0}
            onClick={() =>
              setIds((old) => {
                const next = [...old];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                return next;
              })
            }
          >
            ↑
          </button>
          <button
            type="button"
            className="admin-button small"
            aria-label={`Move episode ${index + 1} down`}
            disabled={index === ids.length - 1}
            onClick={() =>
              setIds((old) => {
                const next = [...old];
                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                return next;
              })
            }
          >
            ↓
          </button>
        </div>
      ))}
      {season && !ids.length && <p>No episodes in this season.</p>}
      <button className="admin-button" disabled={!ids.length}>
        Save episode order
      </button>
    </form>
  );
}
