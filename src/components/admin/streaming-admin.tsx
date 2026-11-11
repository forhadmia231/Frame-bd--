"use client";
import { useEffect, useRef, useState } from "react";
type Option = { id: string; label: string; contentId?: string; type?: string };
type Job = {
  id: string;
  status: string;
  progress: number;
  duration: number | null;
  resolutions: number[];
  errorCode: string | null;
  attempts: number;
  content: { title: string };
  episode: { title: string } | null;
  sourceMedia: { name: string };
  asset: { id: string } | null;
};
async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch("/api/stream/" + path, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    ...(data ? { body: JSON.stringify(data) } : {}),
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error?.message || "Streaming request failed.");
  return value.data;
}
export function StreamingAdmin({
  options,
  revision,
  onDone,
}: {
  options: Record<string, Option[]>;
  revision: number;
  onDone: () => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [rights, setRights] = useState(false),
    [busy, setBusy] = useState(false),
    [percent, setPercent] = useState(0),
    [contentId, setContent] = useState(""),
    [episodeId, setEpisode] = useState(""),
    [sourceId, setSource] = useState(""),
    [confirm, setConfirm] = useState<string | null>(null);
  const xhr = useRef<XMLHttpRequest | null>(null),
    upload = useRef<{
      id: string;
      partSize: number;
      parts: number;
      name: string;
      size: number;
      completed: { number: number; etag: string }[];
    } | null>(null),
    cancelled = useRef(false);
  useEffect(() => {
    let active = true;
    let running = false;
    let hasActiveJobs = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (running || document.hidden) return;
      running = true;
      clearTimeout(timer);
      try {
        const values = await api<Job[]>("jobs");
        if (!active) return;
        setJobs(values);
        hasActiveJobs = values.some((job) => ["QUEUED", "PROCESSING"].includes(job.status));
        if (hasActiveJobs)
          timer = setTimeout(() => void refresh(), 5000);
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Could not load jobs.");
          if (hasActiveJobs) timer = setTimeout(() => void refresh(), 15000);
        }
      } finally {
        running = false;
      }
    };
    const onVisibility = () => {
      if (document.hidden) clearTimeout(timer);
      else void refresh();
    };
    void refresh();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [revision]);
  useEffect(() => () => xhr.current?.abort(), []);
  async function action(run: () => Promise<unknown>, success: string) {
    setError("");
    setBusy(true);
    try {
      await run();
      setMessage(success);
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Operation failed.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }
  async function uploadVideo() {
    if (!file || !rights) return;
    await action(async () => {
      cancelled.current = false;
      if (
        !upload.current ||
        upload.current.name !== file.name ||
        upload.current.size !== file.size
      ) {
        const prepared = await api<{
          id: string;
          partSize: number;
          parts: number;
        }>("uploads", "POST", {
          name: file.name,
          bytes: file.size,
          mime: file.type || "video/mp4",
          authorized: true,
        });
        upload.current = {
          ...prepared,
          name: file.name,
          size: file.size,
          completed: [],
        };
      }
      const state = upload.current;
      for (
        let number = state.completed.length + 1;
        number <= state.parts;
        number++
      ) {
        if (cancelled.current) throw new Error("Upload cancelled.");
        let etag = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const signed = await api<{
              url: string;
              headers: Record<string, string>;
            }>(`uploads/${state.id}/parts/${number}`, "POST", {});
            etag = await new Promise<string>((resolve, reject) => {
              const request = new XMLHttpRequest();
              xhr.current = request;
              request.open("PUT", signed.url);
              for (const [header, value] of Object.entries(signed.headers))
                request.setRequestHeader(header, value);
              request.upload.onprogress = (event) =>
                setPercent(
                  Math.min(
                    99,
                    Math.floor(
                      (((number - 1) * state.partSize + event.loaded) /
                        file.size) *
                        100,
                    ),
                  ),
                );
              request.onload = () => {
                if (request.status < 200 || request.status >= 300)
                  return reject(
                    new Error("Storage rejected this upload part."),
                  );
                try {
                  resolve(
                    signed.url.startsWith("/")
                      ? JSON.parse(request.responseText).data.etag
                      : request.getResponseHeader("ETag") || "",
                  );
                } catch {
                  reject(new Error("Could not verify the uploaded part."));
                }
              };
              request.onerror = () =>
                reject(
                  new Error(
                    "Upload interrupted. Check your network and storage CORS.",
                  ),
                );
              request.onabort = () => reject(new Error("Upload cancelled."));
              request.send(
                file.slice(
                  (number - 1) * state.partSize,
                  Math.min(number * state.partSize, file.size),
                ),
              );
            });
            if (!etag)
              throw new Error(
                "Storage must expose the ETag response header in its CORS policy.",
              );
            break;
          } catch (reason) {
            if (cancelled.current || attempt === 2) throw reason;
            await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
          }
        }
        state.completed.push({ number, etag });
      }
      await api(`uploads/${state.id}/complete`, "POST", {
        parts: state.completed,
      });
      setSource(state.id);
      setPercent(100);
      upload.current = null;
    }, "Original uploaded and verified. Choose the target title/episode and queue processing.");
  }
  const episodic = ["TV_SERIES", "WEB_SERIES", "ANIME"].includes(
    options.content?.find((v) => v.id === contentId)?.type || "",
  );
  return (
    <section className="admin-panel admin-streaming">
      <div className="admin-panel-heading">
        <h2>Video streaming pipeline</h2>
        <span className="admin-live">Private storage · FFmpeg worker</span>
      </div>
      <div className="stream-admin-body">
        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="admin-toast" role="status">
            {message}
          </p>
        )}
        <form
          className="stream-upload-form"
          onSubmit={(event) => {
            event.preventDefault();
            void uploadVideo();
          }}
        >
          <label>
            Authorized video original
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setPercent(0);
              }}
            />
          </label>
          <label className="stream-rights">
            <input
              type="checkbox"
              checked={rights}
              onChange={(event) => setRights(event.target.checked)}
            />
            Frame BD owns or has distribution rights to this video
          </label>
          <button
            className="admin-button primary"
            disabled={busy || !file || !rights}
          >
            {busy ? "Uploading…" : "Upload / retry multipart upload"}
          </button>
          {busy && (
            <button
              type="button"
              className="admin-button danger"
              onClick={() => {
                cancelled.current = true;
                xhr.current?.abort();
                const pending = upload.current;
                if (pending)
                  void api(`uploads/${pending.id}`, "DELETE")
                    .then(() => {
                      upload.current = null;
                      setMessage("Multipart upload aborted.");
                    })
                    .catch((reason) => setError(reason.message));
              }}
            >
              Cancel upload
            </button>
          )}
          <label>
            Upload progress
            <progress value={percent} max={100} />
            {percent}%
          </label>
          <small>
            8 MB+ parts go directly to R2/S3. Explicit loopback development mode
            allows bounded local sample uploads. Retry continues completed parts
            while this page stays open.
          </small>
        </form>
        <form
          className="stream-queue-form"
          onSubmit={(event) => {
            event.preventDefault();
            void action(
              () =>
                api("jobs", "POST", {
                  contentId,
                  episodeId: episodic ? episodeId : null,
                  sourceMediaId: sourceId,
                }),
              "Processing queued. Keep the separate worker running.",
            );
          }}
        >
          <label>
            Verified original
            <select
              required
              value={sourceId}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">Choose original</option>
              {options.videos?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target content
            <select
              required
              value={contentId}
              onChange={(e) => {
                setContent(e.target.value);
                setEpisode("");
              }}
            >
              <option value="">Choose title</option>
              {options.content?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          {episodic && (
            <label>
              Target episode
              <select
                required
                value={episodeId}
                onChange={(e) => setEpisode(e.target.value)}
              >
                <option value="">Choose episode</option>
                {options.episodes
                  ?.filter((v) => v.contentId === contentId)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <button
            className="admin-button primary"
            disabled={
              busy || !sourceId || !contentId || (episodic && !episodeId)
            }
          >
            Queue HLS processing
          </button>
        </form>
        <p className="admin-note">
          QUEUED → PROCESSING → READY only after every generated
          playlist/segment is stored and verified. A failed job never grants
          playback. Run <code>npm.cmd run worker:stream</code> in another
          terminal.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Content / original</th>
                <th>Processing</th>
                <th>Duration / renditions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <strong>{job.content.title}</strong>
                    <small>
                      {job.episode?.title || "Movie"} · {job.sourceMedia.name}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${job.status === "READY" ? "positive" : ""}`}
                    >
                      {job.status}
                    </span>
                    <progress
                      aria-label={`${job.content.title} processing`}
                      value={job.progress}
                      max={100}
                    />
                    <small>
                      {job.progress}% · attempt {job.attempts}
                      {job.errorCode ? " · " + job.errorCode : ""}
                    </small>
                  </td>
                  <td>
                    {job.duration
                      ? `${job.duration.toFixed(1)}s`
                      : "Not probed yet"}
                    <small>
                      {job.resolutions.map((v) => `${v}p`).join(" · ") ||
                        "No verified renditions"}
                    </small>
                  </td>
                  <td>
                    {job.status === "FAILED" && (
                      <button
                        className="admin-button small"
                        disabled={busy}
                        onClick={() =>
                          void action(
                            () => api(`jobs/${job.id}/retry`, "POST", {}),
                            "Failed job queued for a fresh attempt.",
                          )
                        }
                      >
                        Retry processing
                      </button>
                    )}
                    {!["QUEUED", "PROCESSING"].includes(job.status) && (
                      <button
                        className="admin-button danger small"
                        disabled={busy}
                        onClick={() => setConfirm(job.id)}
                      >
                        Delete unused job
                      </button>
                    )}
                    {job.asset && (
                      <small>
                        Detach generated HLS reference in Video references
                        before deleting.
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!jobs.length && (
            <p className="admin-empty">
              No processing jobs. Upload an authorized original to begin.
            </p>
          )}
        </div>
        {confirm && (
          <div className="admin-modal-backdrop">
            <section
              className="admin-modal"
              role="alertdialog"
              aria-modal="true"
              aria-label="Delete unused processed video"
            >
              <h2>Delete unused processed video?</h2>
              <p>
                Generated files will be removed. Attached references and active
                processing are protected.
              </p>
              <button
                autoFocus
                className="admin-button"
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="admin-button danger"
                disabled={busy}
                onClick={() =>
                  void action(
                    () => api(`jobs/${confirm}`, "DELETE"),
                    "Unused processing job and generated files deleted.",
                  )
                }
              >
                Confirm deletion
              </button>
            </section>
          </div>
        )}
      </div>
    </section>
  );
}
