import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSubtitles } from "../src/modules/streaming/subtitles.ts";
test("SRT timestamps convert to valid WebVTT without retaining HTML", () => {
  assert.equal(
    normalizeSubtitles(
      "1\n00:00:01,000 --> 00:00:02,100\n<b>Owned</b> sample\n",
    ),
    "WEBVTT\n\n00:00:01.000 --> 00:00:02.100\nOwned sample\n",
  );
});
test("WebVTT normalizes BOM and CRLF", () => {
  assert.ok(
    normalizeSubtitles(
      "\uFEFFWEBVTT\r\n\r\n00:00:00.000 --> 00:00:01.000\r\nSample\r\n",
    ).startsWith("WEBVTT\n\n"),
  );
});
test("subtitle validation rejects scripts, binary content and malformed timing", () => {
  for (const value of [
    "<script>alert(1)</script>",
    "WEBVTT\n\0",
    "1\nnot a timestamp\ntext",
    "WEBVTT\n\nno timed cues",
  ])
    assert.throws(() => normalizeSubtitles(value));
});
