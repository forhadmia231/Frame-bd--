"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type Hls from "hls.js";
import type { CatalogTitle } from "@/types/catalog";
import {
  requestPlayback,
  type PlaybackSessionData,
} from "@/modules/streaming/playback-adapter";
import { useBrowserStorage } from "@/lib/browser-storage";
import { useHydrated } from "@/lib/use-hydrated";
import "./player.css";
const clock = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(value / 3600) ? Math.floor(value / 3600) + ":" : ""}${String(Math.floor(value / 60) % 60).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};
export function VideoPlayerContainer({
  title,
  episode,
  nextHref,
}: {
  title: CatalogTitle;
  episode?: string;
  nextHref?: string;
}) {
  const router = useRouter(),
    container = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null),
    hls = useRef<Hls | null>(null),
    mounted = useRef(true),
    starting = useRef(false),
    savedAt = useRef(0),
    started = useRef(false);
  const hydrated = useHydrated();
  const [session, setSession] = useState<PlaybackSessionData | null>(null),
    [expanded, setExpanded] = useState(false),
    [nativeMode, setNativeMode] = useState(false),
    [pending, setPending] = useState(false),
    [playing, setPlaying] = useState(false),
    [buffering, setBuffering] = useState(false),
    [position, setPosition] = useState(0),
    [duration, setDuration] = useState(0),
    [volume, setVolume] = useState(1),
    [rate, setRate] = useState(1),
    [quality, setQuality] = useState(-1),
    [levels, setLevels] = useState<{ height: number; index: number }[]>([]),
    [audio, setAudio] = useState<{ id: number; name: string }[]>([]),
    [audioId, setAudioId] = useState(0),
    [subtitle, setSubtitle] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const autoNext = useBrowserStorage("frame-bd:autoplay-next:v1", "false");
  const guestKey = `frame-bd:guest-progress:${title.slug}:${episode || "movie"}`;
  async function save(
    force = false,
    leaving = false,
    elementOverride?: HTMLVideoElement,
  ) {
    const element = elementOverride || video.current;
    if (
      !session ||
      !element ||
      !started.current ||
      element.currentTime < 1 ||
      (!force && Date.now() - savedAt.current < 15000) ||
      (force && !element.ended && Date.now() - savedAt.current < 3000)
    )
      return;
    savedAt.current = Date.now();
    const value = Math.min(
      element.ended
        ? Math.ceil(session.duration)
        : Math.floor(element.currentTime),
      Math.ceil(session.duration),
    );
    if (!session.signedIn) {
      try {
        localStorage.setItem(
          guestKey,
          JSON.stringify({
            position: value,
            duration: session.duration,
            updatedAt: Date.now(),
          }),
        );
      } catch {}
      return;
    }
    try {
      const response = await fetch("/api/v1/me/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: title.slug,
          episodeKey: episode || "",
          playbackSessionId: session.id,
          position: value,
        }),
        keepalive: leaving,
      });
      if (!response.ok && !leaving)
        setMessage("Playback continues; progress could not be synchronized.");
    } catch {
      if (!leaving)
        setMessage(
          "Playback continues; progress will retry when you are online.",
        );
    }
  }
  async function start() {
    if (starting.current) return;
    starting.current = true;
    started.current = false;
    savedAt.current = 0;
    video.current?.pause();
    setPending(true);
    setBuffering(true);
    setQuality(-1);
    setLevels([]);
    setAudio([]);
    setAudioId(0);
    setSubtitle("");
    setError("");
    setMessage("");
    try {
      const result = await requestPlayback(title.slug, episode);
      if (!mounted.current || !video.current) return;
      if (result.status !== "ready") throw new Error(result.message);
      const data = result.session;
      setSession(data);
      const element = video.current!;
      hls.current?.destroy();
      hls.current = null;
      let resume = data.resumePosition;
      if (!data.signedIn)
        try {
          const guest = JSON.parse(localStorage.getItem(guestKey) || "{}");
          if (
            typeof guest.position === "number" &&
            guest.position > 0 &&
            guest.position < data.duration - 3
          )
            resume = guest.position;
        } catch {}
      element.onloadedmetadata = () => {
        setDuration(element.duration || data.duration);
        if (resume > 0 && resume < (element.duration || data.duration) - 2) {
          element.currentTime = resume;
          setMessage(`Resuming at ${clock(resume)}.`);
        }
      };
      const tryPlay = () => {
        element
          .play()
          .catch(() =>
            setMessage(
              "Press Play to start. Your browser requires a playback gesture.",
            ),
          );
      };
      const { default: HlsClass } = await import("hls.js");
      if (!mounted.current) return;
      const nativeApple =
        /Safari/i.test(navigator.userAgent) &&
        !/Chrome|Chromium|CriOS|Edg/i.test(navigator.userAgent);
      if (
        element.canPlayType("application/vnd.apple.mpegurl") &&
        (nativeApple || !HlsClass.isSupported())
      ) {
        setNativeMode(true);
        element.src = data.url;
        element.load();
        setLevels([]);
        setMessage(
          "Native adaptive HLS. Quality and audio options depend on browser controls.",
        );
        tryPlay();
      } else {
        setNativeMode(false);
        if (!HlsClass.isSupported())
          throw new Error(
            "This browser cannot play HLS. Use a current browser with native HLS or Media Source Extensions.",
          );
        const engine = new HlsClass({
          enableWorker: true,
          maxBufferLength: 30,
          backBufferLength: 30,
          startLevel: -1,
        });
        hls.current = engine;
        let recoveries = 0;
        engine.on(HlsClass.Events.MANIFEST_PARSED, () => {
          setLevels(
            engine.levels.map((level, index) => ({
              height: level.height,
              index,
            })),
          );
          setAudio(
            engine.audioTracks.map((track) => ({
              id: track.id,
              name: track.name || track.lang || `Audio ${track.id + 1}`,
            })),
          );
          tryPlay();
        });
        engine.on(HlsClass.Events.AUDIO_TRACKS_UPDATED, () =>
          setAudio(
            engine.audioTracks.map((track) => ({
              id: track.id,
              name: track.name || `Audio ${track.id + 1}`,
            })),
          ),
        );
        engine.on(HlsClass.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          const code = data.response?.code;
          if (code === 401 || code === 403) {
            setError(
              "Playback authorization expired or access was revoked. Start playback again.",
            );
            engine.destroy();
          } else if (
            recoveries++ < 2 &&
            data.type === HlsClass.ErrorTypes.MEDIA_ERROR
          )
            engine.recoverMediaError();
          else if (
            recoveries < 3 &&
            data.type === HlsClass.ErrorTypes.NETWORK_ERROR
          )
            engine.startLoad();
          else {
            setError(
              "The video stream was interrupted. Retry playback or check your connection.",
            );
            engine.destroy();
          }
        });
        engine.loadSource(data.url);
        engine.attachMedia(element);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Playback could not start.",
      );
    } finally {
      starting.current = false;
      if (mounted.current) setPending(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const element = video.current;
    return () => {
      mounted.current = false;
      hls.current?.destroy();
      element?.pause();
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      requestPlayback(title.slug, episode, session.id)
        .then((result) => {
          if (result.status !== "ready")
            setMessage("Playback session could not be renewed.");
        })
        .catch(() =>
          setMessage(
            "Playback authorization could not be renewed. Retry if playback stops.",
          ),
        );
    }, 120000);
    return () => clearInterval(timer);
  }, [session, title.slug, episode]);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const element = video.current;
    const leaving = () => {
      void saveRef.current(true, true, element || undefined);
    };
    window.addEventListener("pagehide", leaving);
    const visibility = () => {
      if (document.visibilityState === "hidden") leaving();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      leaving();
      window.removeEventListener("pagehide", leaving);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (
      autoNext.ready &&
      autoNext.value === "true" &&
      new URLSearchParams(window.location.search).get("autoplay") === "1"
    )
      void Promise.resolve().then(() =>
        start(),
      ); /* Explicit browser preference is required before next-episode autoplay. */
    // Start only when this player first receives the persisted preference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNext.ready]);
  async function toggle() {
    if (!session || error) {
      await start();
      return;
    }
    const element = video.current!;
    if (element.paused)
      element
        .play()
        .catch(() => setMessage("Playback could not start. Try again."));
    else element.pause();
  }
  async function fullscreen() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (container.current?.requestFullscreen) {
        await container.current.requestFullscreen();
        await (
          screen.orientation as ScreenOrientation & {
            lock?: (value: string) => Promise<void>;
          }
        )
          .lock?.("landscape")
          .catch(() => {});
      } else if (
        (
          video.current as HTMLVideoElement & {
            webkitEnterFullscreen?: () => void;
          }
        )?.webkitEnterFullscreen
      )
        (
          video.current as HTMLVideoElement & {
            webkitEnterFullscreen: () => void;
          }
        ).webkitEnterFullscreen();
      else {
        setExpanded(true);
        setMessage(
          "Expanded player mode. Native fullscreen is unavailable in this browser.",
        );
      }
    } catch {
      setExpanded(true);
      setMessage(
        "Expanded player mode. Native fullscreen was blocked by the browser.",
      );
    }
  }
  function seek(value: number) {
    if (video.current && session) {
      video.current.currentTime = Math.max(
        0,
        Math.min(duration || session.duration, value),
      );
      setPosition(video.current.currentTime);
    }
  }
  return (
    <section className="frame-player-section">
      <div
        className={`frame-player ${expanded ? "frame-player-expanded" : ""}`}
        ref={container}
        tabIndex={0}
        aria-label={`${title.title} video player`}
        onKeyDown={(event) => {
          const key = event.key.toLowerCase();
          if (key === "escape" && expanded) {
            setExpanded(false);
            return;
          }
          if (
            (event.target as HTMLElement).closest(
              "input,select,textarea,button,a",
            )
          )
            return;
          if (
            [" ", "k", "j", "l", "arrowleft", "arrowright", "f", "m"].includes(
              key,
            )
          )
            event.preventDefault();
          if (key === " " || key === "k") void toggle();
          if (["j", "arrowleft"].includes(key))
            seek((video.current?.currentTime || 0) - 10);
          if (["l", "arrowright"].includes(key))
            seek((video.current?.currentTime || 0) + 10);
          if (key === "f") void fullscreen();
          if (key === "m" && video.current) {
            video.current.muted = !video.current.muted;
            setVolume(video.current.muted ? 0 : video.current.volume);
          }
        }}
      >
        <video
          ref={video}
          playsInline
          preload="none"
          poster={title.backdrop || title.artwork}
          controls={nativeMode}
          onClick={() => void toggle()}
          onPlaying={() => {
            started.current = true;
            setPlaying(true);
            setBuffering(false);
          }}
          onPause={() => {
            setPlaying(false);
            void save(true);
          }}
          onWaiting={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)}
          onError={() => {
            if (!hls.current)
              setError(
                "The native player could not load this video. Retry playback or use a current supported browser.",
              );
          }}
          onTimeUpdate={() => {
            setPosition(video.current?.currentTime || 0);
            void save();
          }}
          onDurationChange={() =>
            setDuration(
              Number.isFinite(video.current?.duration)
                ? video.current!.duration
                : session?.duration || 0,
            )
          }
          onEnded={() => {
            setPlaying(false);
            void save(true);
            if (nextHref && autoNext.value === "true")
              router.push(nextHref + "&autoplay=1");
          }}
          crossOrigin="use-credentials"
        >
          {session?.subtitles.map((track, index) => (
            <track
              key={track.id}
              kind="subtitles"
              src={track.url}
              srcLang={
                /bangla/i.test(track.language)
                  ? "bn"
                  : /english/i.test(track.language)
                    ? "en"
                    : track.language.toLowerCase().slice(0, 2)
              }
              label={track.language}
              data-track-index={index}
            />
          ))}
        </video>
        {(!session || error) && (
          <div className="frame-player-start">
            <span className="eyebrow">FRAME BD · SECURE HLS</span>
            <h2>{error ? "Playback unavailable" : title.title}</h2>
            <p>
              {error ||
                "Start playback to check access and load the authorized stream."}
            </p>
            <button
              className="button button-primary"
              disabled={pending || !hydrated}
              onClick={() => void start()}
            >
              {pending
                ? "Authorizing…"
                : error
                  ? "Retry playback"
                  : "▶ Play video"}
            </button>
          </div>
        )}
        {(pending || buffering) && !error && (
          <div className="frame-buffer" role="status">
            ◌ {pending ? "Checking access…" : "Buffering…"}
          </div>
        )}
        <div className="frame-control-panel">
          <label className="frame-seek-label">
            <span className="sr-only">Seek video</span>
            <input
              aria-label="Seek video"
              type="range"
              min={0}
              max={duration || session?.duration || 1}
              step="0.1"
              value={position}
              disabled={!session}
              onChange={(e) => seek(Number(e.target.value))}
            />
          </label>
          <div className="frame-controls">
            <button
              aria-label={playing ? "Pause" : "Play"}
              disabled={pending || !hydrated}
              onClick={() => void toggle()}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <span className="frame-time">
              {clock(position)} / {clock(duration)}
            </span>
            <label>
              Volume
              <input
                aria-label="Volume"
                type="range"
                min={0}
                max={1}
                step="0.05"
                value={volume}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setVolume(value);
                  if (video.current) {
                    video.current.volume = value;
                    video.current.muted = value === 0;
                  }
                }}
              />
            </label>
            <label>
              Speed
              <select
                aria-label="Playback speed"
                value={rate}
                onChange={(e) => {
                  setRate(Number(e.target.value));
                  if (video.current)
                    video.current.playbackRate = Number(e.target.value);
                }}
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quality
              <select
                aria-label="Video quality"
                value={quality}
                disabled={!levels.length}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setQuality(value);
                  if (hls.current) hls.current.currentLevel = value;
                }}
              >
                <option value={-1}>Auto</option>
                {levels.map((level) => (
                  <option key={level.index} value={level.index}>
                    {level.height}p
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subtitles
              <select
                aria-label="Subtitle language"
                value={subtitle}
                onChange={(e) => {
                  setSubtitle(e.target.value);
                  if (video.current)
                    Array.from(video.current.textTracks).forEach(
                      (track, index) => {
                        track.mode =
                          String(index) === e.target.value
                            ? "showing"
                            : "disabled";
                      },
                    );
                }}
              >
                <option value="">Off</option>
                {session?.subtitles.map((track, index) => (
                  <option key={track.id} value={index}>
                    {track.language}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Audio
              <select
                aria-label="Audio track"
                value={audioId}
                disabled={!audio.length}
                onChange={(e) => {
                  setAudioId(Number(e.target.value));
                  if (hls.current)
                    hls.current.audioTrack = Number(e.target.value);
                }}
              >
                {audio.length ? (
                  audio.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.name}
                    </option>
                  ))
                ) : (
                  <option value={0}>Default</option>
                )}
              </select>
            </label>
            <button
              aria-label="Toggle fullscreen player"
              onClick={() => void fullscreen()}
            >
              ⛶
            </button>
          </div>
        </div>
      </div>
      <p className="frame-player-status" role="status">
        {message ||
          (!session
            ? "No video data is loaded until you press Play."
            : session.signedIn
              ? "Progress is saved to your account."
              : "Guest progress stays in this browser; sign in for synchronization.")}
      </p>
      <p className="fine-print">
        Player shortcuts: Space/K play · ←/→ or J/L seek · M mute · F
        fullscreen. Native-browser quality/audio controls vary.
      </p>
      {nextHref && (
        <label className="frame-auto-next">
          <input
            type="checkbox"
            checked={autoNext.value === "true"}
            onChange={(e) => autoNext.write(String(e.target.checked))}
          />
          Auto-play the next episode on this browser (off by default)
        </label>
      )}
    </section>
  );
}
