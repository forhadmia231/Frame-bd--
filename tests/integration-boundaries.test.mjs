import test from "node:test";
import assert from "node:assert/strict";
import { requestPlayback } from "../src/modules/streaming/playback-adapter.ts";

test("unconnected playback never exposes a media URL or grants access", async () => {
  const result = await requestPlayback();
  assert.equal(result.status, "unavailable");
  assert.equal("url" in result, false);
  assert.equal("token" in result, false);
});
