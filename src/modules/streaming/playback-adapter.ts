export type PlaybackSessionData = {
  id: string;
  url: string;
  expiresAt: string;
  duration: number;
  resolutions: number[];
  signedIn: boolean;
  resumePosition: number;
  subtitles: { id: string; language: string; url: string }[];
};
export type PlaybackState =
  | { status: "unavailable"; message: string }
  | { status: "ready"; session: PlaybackSessionData };
export async function requestPlayback(
  slug?: string,
  episodeKey?: string,
  sessionId?: string,
): Promise<PlaybackState> {
  if (!slug)
    return {
      status: "unavailable",
      message:
        "Choose an authorized published title to start a playback session.",
    };
  const response = await fetch("/api/stream/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug,
      ...(episodeKey ? { episodeKey } : {}),
      ...(sessionId ? { sessionId } : {}),
    }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message || "Playback authorization failed.");
  return { status: "ready", session: result.data };
}
