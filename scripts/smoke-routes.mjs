import assert from "node:assert/strict";

const origin = process.env.SMOKE_ORIGIN || "http://localhost:3000";
const catalog = (
  await (await fetch(origin + "/api/v1/catalog?pageSize=100")).json()
).data;
const routes = [
  "/",
  "/movies",
  "/series",
  "/anime",
  "/documentaries",
  "/shorts",
  "/categories",
  "/search",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",

  "/watchlist",

  "/plans",
  "/settings",
  "/about",
  "/categories?genre=Drama&sort=rating",
  "/search?q=orbit",
  ...catalog.flatMap((title) => [
    `/titles/${title.slug}`,
    `/watch/${title.slug}`,
  ]),
  "/watch/midnight-in-kyoto?episode=s2e6",
];
for (let offset = 0; offset < routes.length; offset += 6) {
  await Promise.all(
    routes.slice(offset, offset + 6).map(async (path) => {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.ok(html.includes("FRAME"), `Brand missing: ${path}`);
      assert.ok(!html.includes("Internal Server Error"), path);
    }),
  );
}
for (const route of [
  "/unknown-page",
  "/titles/missing",
  "/watch/missing",
  "/watch/midnight-in-kyoto?episode=s99e1",
]) {
  assert.equal((await fetch(origin + route)).status, 404, route);
}
for (const route of [
  "/sign-in",
  "/account",
  "/profile",
  "/profile/edit",
  "/history",
  "/continue-watching",
])
  assert.equal(
    (await fetch(origin + route, { redirect: "manual" })).status,
    307,
    route,
  );
const health = await (await fetch(origin + "/api/health")).json();
assert.equal(health.status, "ok");
console.log(
  `${routes.length} frontend URLs passed; 4 invalid routes returned 404; 6 redirects and health passed.`,
);
