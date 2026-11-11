function validateTiming(line: string) {
  const pieces = line.trim().split(/\s+-->\s+/);
  const parse = (value: string) => {
    const found = value
      .split(/\s/)[0]
      .match(/^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)[.,](\d{3})$/);
    if (!found) throw new Error("Invalid subtitle timestamp.");
    return (
      Number(found[1] || 0) * 3600 +
      Number(found[2]) * 60 +
      Number(found[3]) +
      Number(found[4]) / 1000
    );
  };
  if (pieces.length !== 2 || parse(pieces[1]) <= parse(pieces[0]))
    throw new Error("Subtitle cues must end after they start.");
}
export function normalizeSubtitles(input: string) {
  const text = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (
    text.includes("\0") ||
    /<\/?(?:script|iframe|style|object|embed)\b/i.test(text) ||
    Buffer.byteLength(text) > 1048576
  )
    throw new Error("Invalid subtitle file.");
  if (text.startsWith("WEBVTT")) {
    if (
      !/\d{2}:\d{2}(?::\d{2})?\.\d{3} --> \d{2}:\d{2}(?::\d{2})?\.\d{3}/.test(
        text,
      )
    )
      throw new Error("WebVTT must contain valid timed cues.");
    for (const line of text.split("\n"))
      if (line.includes("-->")) validateTiming(line);
    return (
      text
        .split(/\n\s*\n/)
        .filter((block) => !/^STYLE\n|^REGION\n/.test(block))
        .join("\n\n") + "\n"
    );
  }
  const blocks = text.split(/\n\s*\n/);
  if (!blocks.length) throw new Error("Empty subtitle file.");
  const converted = blocks.map((block) => {
    const lines = block.split("\n");
    if (/^\d+$/.test(lines[0])) lines.shift();
    const timing = lines.shift();
    if (
      !timing ||
      !/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/.test(timing) ||
      !lines.length
    )
      throw new Error("Choose WebVTT or a valid SRT subtitle file.");
    validateTiming(timing);
    return (
      timing.replaceAll(",", ".") +
      "\n" +
      lines.join("\n").replace(/<[^>]*>/g, "")
    );
  });
  return "WEBVTT\n\n" + converted.join("\n\n") + "\n";
}
