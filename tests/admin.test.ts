import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { getDb } from "../src/lib/db";
import { schemas, settingsSchema } from "../src/modules/admin/schemas";
import { paymentMethodsSchema } from "../src/modules/admin/payment-methods";
const origin = process.env.TEST_ORIGIN || "http://localhost:3000",
  db = getDb(),
  tag = randomUUID().replaceAll("-", "").slice(0, 10),
  password = "Disposable-admin-test-123456!";
if (
  !["localhost", "127.0.0.1"].includes(new URL(origin).hostname) ||
  process.env.EMAIL_DELIVERY_MODE !== "local" ||
  new URL(process.env.DATABASE_URL!).port !== "55432"
)
  throw new Error(
    "Admin tests require the isolated local application, database and SMTP inbox.",
  );
type Jar = { cookie: string };
async function call(
  path: string,
  method = "GET",
  data?: unknown,
  jar: Jar = { cookie: "" },
  headers: Record<string, string> = {},
  raw?: Buffer,
  attempt = 0,
) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      ...(jar.cookie ? { Cookie: jar.cookie } : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(raw
      ? { body: new Uint8Array(raw).buffer }
      : data === undefined
        ? {}
        : { body: JSON.stringify(data) }),
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 429 && attempt < 2 && path.startsWith("/api/auth/")) {
    const seconds = Number(
      response.headers.get("x-retry-after") ||
        response.headers.get("retry-after"),
    );
    if (seconds > 0 && seconds <= 15) {
      await response.text();
      await new Promise((r) => setTimeout(r, (seconds + 1) * 1000));
      return call(path, method, data, jar, headers, raw, attempt + 1);
    }
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length)
    jar.cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: response.status, json, text, headers: response.headers };
}
const users: string[] = [],
  contentIds: string[] = [],
  mediaIds: string[] = [],
  genreIds: string[] = [],
  categoryIds: string[] = [],
  planIds: string[] = [],
  couponIds: string[] = [],
  sectionIds: string[] = [],
  bannerIds: string[] = [];
async function register(role: "USER" | "ADMIN" | "SUPER_ADMIN") {
  const email = `frame-admin-${tag}-${role.toLowerCase()}@example.test`;
  const response = await call("/api/auth/sign-up/email", "POST", {
    email,
    name: `Test ${role}`,
    password,
  });
  assert.equal(response.status, 200);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  users.push(user.id);
  const rows = readFileSync(".local/mailbox/messages.jsonl", "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const message = rows.reverse().find((row) => row.to.includes(email));
  assert.ok(message);
  const decoded = message.raw
    .replace(/=\r?\n/g, "")
    .replace(/=([A-F0-9]{2})/g, (_: string, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  const link = decoded.match(
    /http:\/\/localhost:3000\/api\/auth\/[^\s<>]+/,
  )?.[0];
  assert.ok(link);
  await fetch(link, { redirect: "manual" });
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified,
    true,
  );
  await db.user.update({ where: { id: user.id }, data: { role } });
  const jar = { cookie: "" };
  assert.equal(
    (await call("/api/auth/sign-in/email", "POST", { email, password }, jar))
      .status,
    200,
  );
  return { user, email, jar };
}
function payload(slug: string, poster = "/artwork/mountains.jpg") {
  return schemas.content.parse({
    title: `CMS ${tag}`,
    slug: `cms-${tag}-${slug}`,
    description: "An isolated authorized CMS integration fixture.",
    type: "MOVIE",
    releaseYear: 2026,
    duration: 90,
    posterPath: poster,
  });
}
test(
  "Admin CMS: actual authentication, CRUD, media, publishing and permission boundaries",
  { timeout: 240000 },
  async (suite) => {
    let originalBrand: unknown;
    let brandChanged = false;
    try {
      const normal = await register("USER"),
        admin = await register("ADMIN"),
        superUser = await register("SUPER_ADMIN");
      await suite.test("payment receiving methods persist with validation and Super Admin permissions", async () => {
        const path = "/api/v1/admin/payment-methods";
        const previous = await db.platformSetting.findUnique({where: {key: "payment-methods"}});
        try {
          assert.equal((await call(path)).status, 401);
          assert.equal((await call(path, "GET", undefined, normal.jar)).status, 403);
          assert.equal((await call(path, "PATCH", {methods: []}, admin.jar)).status, 403);
          const methods = ["BANK", "BKASH_PERSONAL", "BKASH_MERCHANT", "NAGAD"].map(type => ({id: randomUUID(), type, label: `Test ${type}`, enabled: true, accountName: "Owned fixture", accountNumber: type === "BANK" ? "1234567890" : "01700000000", bankName: type === "BANK" ? "Fixture Bank" : "", branch: "", routingNumber: "", instructions: "Test fixture only"}));
          assert.equal((await call(path, "PATCH", {methods}, superUser.jar)).status, 200);
          const result = await call(path, "GET", undefined, superUser.jar);
          assert.deepEqual(paymentMethodsSchema.parse(result.json.data).methods, methods);
          assert.equal((await call(path, "PATCH", {methods: [{...methods[1], accountNumber: "123"}]}, superUser.jar)).status, 400);
          assert.equal((await call(path, "PATCH", {methods, pin: "1234"}, superUser.jar)).status, 400);
          const disabled = methods.map(method => ({...method, enabled: false}));
          assert.equal((await call(path, "PATCH", {methods: disabled}, superUser.jar)).status, 200);
          assert.equal(paymentMethodsSchema.parse((await call(path, "GET", undefined, superUser.jar)).json.data).methods[0].enabled, false);
          assert.equal((await call("/admin/payment-methods", "GET", undefined, superUser.jar)).status, 200);
          assert.ok(await db.auditLog.findFirst({where: {userId: superUser.user.id, action: "ADMIN_PAYMENT_METHODS_UPDATED"}}));
          assert.equal((await call(path, "PATCH", {methods: []}, superUser.jar)).status, 200);
          assert.equal(paymentMethodsSchema.parse((await call(path, "GET", undefined, superUser.jar)).json.data).methods.length, 0);
        } finally {
          if (previous) await db.platformSetting.upsert({where: {key: previous.key}, create: {key: previous.key, value: previous.value as never}, update: {value: previous.value as never}});
          else await db.platformSetting.deleteMany({where: {key: "payment-methods"}});
        }
      });
      await suite.test(
        "admin pages and APIs enforce roles, CSRF and expired sessions",
        async () => {
          assert.equal((await call("/admin")).status, 307);
          assert.equal(
            (await call("/admin", "GET", undefined, normal.jar)).headers.get(
              "location",
            ),
            "/access-denied",
          );
          assert.equal((await call("/api/v1/admin/overview")).status, 401);
          assert.equal(
            (await call("/api/v1/admin/overview", "GET", undefined, normal.jar))
              .status,
            403,
          );
          assert.equal(
            (await call("/admin", "GET", undefined, admin.jar)).status,
            200,
          );
          assert.equal(
            (await call("/api/v1/admin/settings", "GET", undefined, admin.jar))
              .status,
            403,
          );
          assert.equal(
            (
              await call(
                "/api/v1/admin/genres",
                "POST",
                { name: "Bad", slug: "bad", active: true, position: 0 },
                admin.jar,
                { Origin: "https://evil.example" },
              )
            ).status,
            403,
          );
        },
      );
      let imageId = "",
        imagePath = "";
      await suite.test(
        "image uploads validate bytes and cannot expose private subtitle/video files",
        async () => {
          const bytes = await sharp({
            create: {
              width: 64,
              height: 96,
              channels: 3,
              background: "#dc3349",
            },
          })
            .png()
            .toBuffer();
          const image = await call(
            "/api/v1/admin/upload?kind=IMAGE",
            "POST",
            undefined,
            admin.jar,
            {
              "Content-Type": "application/octet-stream",
              "x-file-name": `test-${tag}.png`,
            },
            bytes,
          );
          assert.equal(image.status, 201);
          const value = image.json.data as { id: string; path: string };
          imageId = value.id;
          imagePath = value.path;
          mediaIds.push(imageId);
          assert.equal(
            (
              await call(
                `/api/v1/admin/media/${imageId}`,
                "PATCH",
                { name: `Renamed ${tag}` },
                admin.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (await db.mediaUpload.findUniqueOrThrow({ where: { id: imageId } }))
              .name,
            `Renamed ${tag}`,
          );
          assert.equal(
            (await call(imagePath)).headers.get("content-type"),
            "image/webp",
          );
          assert.equal(
            (
              await call(
                "/api/v1/admin/upload?kind=IMAGE",
                "POST",
                undefined,
                admin.jar,
                { "Content-Type": "application/octet-stream" },
                Buffer.from('<svg onload="alert(1)"></svg>'),
              )
            ).status,
            400,
          );
          const subtitle = await call(
            "/api/v1/admin/upload?kind=SUBTITLE",
            "POST",
            undefined,
            admin.jar,
            { "Content-Type": "application/octet-stream" },
            Buffer.from("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n"),
          );
          assert.equal(subtitle.status, 201);
          const subtitleId = (subtitle.json.data as { id: string }).id;
          mediaIds.push(subtitleId);
          assert.equal((await call(`/api/media/${subtitleId}`)).status, 404);
          assert.equal(
            (
              await call("/api/v1/admin/media", "GET", undefined, admin.jar)
            ).text.includes("storageKey"),
            false,
          );
          if (!process.env.S3_ENDPOINT)
            assert.equal(
              (
                await call(
                  "/api/v1/admin/video-upload",
                  "POST",
                  {
                    name: "Authorized fixture",
                    bytes: 1024,
                    mime: "video/mp4",
                    authorized: true,
                  },
                  admin.jar,
                )
              ).status,
              503,
            );
        },
      );
      let genreId = "",
        categoryId = "",
        contentId = "";
      let movie = payload("movie");
      await suite.test(
        "classifications, draft creation, validation and safe deletion",
        async () => {
          const genre = await call(
            "/api/v1/admin/genres",
            "POST",
            {
              name: `Genre ${tag}`,
              slug: `genre-${tag}`,
              position: 5,
              active: true,
            },
            admin.jar,
          );
          assert.equal(genre.status, 201);
          genreId = String((genre.json.data as { id: string }).id);
          genreIds.push(genreId);
          const category = await call(
            "/api/v1/admin/categories",
            "POST",
            {
              name: `Category ${tag}`,
              slug: `category-${tag}`,
              position: 4,
              active: true,
            },
            admin.jar,
          );
          assert.equal(category.status, 201);
          categoryId = String((category.json.data as { id: string }).id);
          categoryIds.push(categoryId);
          movie = {
            ...payload("movie", imagePath),
            genreIds: [genreId],
            categoryIds: [categoryId],
            languages: ["Bangla"],
            cast: ["Authorized Actor"],
            director: "Authorized Director",
          };
          const created = await call(
            "/api/v1/admin/content",
            "POST",
            movie,
            admin.jar,
          );
          assert.equal(created.status, 201, created.text);
          contentId = String((created.json.data as { id: string }).id);
          contentIds.push(contentId);
          assert.equal(
            (await call(`/api/v1/content/${movie.slug}`)).status,
            404,
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/genres/${genreId}`,
                "DELETE",
                undefined,
                admin.jar,
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/media/${imageId}`,
                "DELETE",
                undefined,
                admin.jar,
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await call(
                "/api/v1/admin/content",
                "POST",
                { ...movie, duration: -1 },
                admin.jar,
              )
            ).status,
            400,
          );
          assert.equal(
            (await call("/api/v1/admin/content", "POST", movie, admin.jar))
              .status,
            409,
          );
        },
      );
      await suite.test(
        "edit, publish, scheduled publication and unpublish reflect on public catalog",
        async () => {
          movie = { ...movie, status: "PUBLISHED", title: `Published ${tag}` };
          assert.equal(
            (
              await call(
                `/api/v1/admin/content/${contentId}`,
                "PATCH",
                movie,
                admin.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (await call(`/api/v1/content/${movie.slug}`)).status,
            200,
          );
          const categorySlug = `category-${tag}`;
          const filtered = await call(
            `/api/v1/catalog?category=${categorySlug}`,
          );
          assert.ok(
            (filtered.json.data as { slug: string }[]).some(
              (v) => v.slug === movie.slug,
            ),
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/categories/${categoryId}`,
                "PATCH",
                {
                  name: `Category ${tag}`,
                  slug: categorySlug,
                  position: 4,
                  active: false,
                },
                admin.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              (await call(`/api/v1/catalog?category=${categorySlug}`)).json
                .data as unknown[]
            ).length,
            0,
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/categories/${categoryId}`,
                "PATCH",
                {
                  name: `Category ${tag}`,
                  slug: categorySlug,
                  position: 4,
                  active: true,
                },
                admin.jar,
              )
            ).status,
            200,
          );
          const scheduled = {
            ...movie,
            publishedAt: new Date(Date.now() + 86400000).toISOString(),
          };
          assert.equal(
            (
              await call(
                `/api/v1/admin/content/${contentId}`,
                "PATCH",
                scheduled,
                admin.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (await call(`/api/v1/content/${movie.slug}`)).status,
            404,
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/content/${contentId}`,
                "PATCH",
                { ...movie, status: "DRAFT" },
                admin.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (await call(`/api/v1/content/${movie.slug}`)).status,
            404,
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/content/${contentId}`,
                "PATCH",
                movie,
                admin.jar,
              )
            ).status,
            200,
          );
        },
      );
      await suite.test(
        "series seasons, episode edits/reordering and premium episode gates",
        async () => {
          const series = payload("series", imagePath);
          const result = await call(
            "/api/v1/admin/content",
            "POST",
            { ...series, type: "TV_SERIES", status: "PUBLISHED" },
            admin.jar,
          );
          assert.equal(result.status, 201);
          const seriesId = String((result.json.data as { id: string }).id);
          contentIds.push(seriesId);
          const season = await call(
            "/api/v1/admin/seasons",
            "POST",
            { contentId: seriesId, number: 1, title: "Season One" },
            admin.jar,
          );
          assert.equal(season.status, 201);
          const seasonId = String((season.json.data as { id: string }).id);
          const ids = [];
          for (let number = 1; number <= 2; number++) {
            const ep = await call(
              "/api/v1/admin/episodes",
              "POST",
              {
                seasonId,
                number,
                title: `Episode ${number}`,
                description: "Test episode",
                duration: 20,
                thumbnailPath: imagePath,
                status: "DRAFT",
                language: "Bangla",
                access: "PREMIUM",
              },
              admin.jar,
            );
            assert.equal(ep.status, 201);
            ids.push(String((ep.json.data as { id: string }).id));
          }
          assert.equal(
            (
              await call(
                `/api/v1/admin/episodes/${seasonId}/reorder`,
                "POST",
                { ids: [...ids].reverse() },
                admin.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (await db.episode.findUniqueOrThrow({ where: { id: ids[1] } }))
              .number,
            1,
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/episodes/${seasonId}/reorder`,
                "POST",
                { ids: [ids[0], ids[0]] },
                admin.jar,
              )
            ).status,
            400,
          );
          const episode = await db.episode.findUniqueOrThrow({
            where: { id: ids[1] },
          });
          const edited = await call(
            `/api/v1/admin/episodes/${ids[1]}`,
            "PATCH",
            {
              seasonId,
              number: 1,
              title: episode.title,
              description: "Updated",
              duration: 20,
              thumbnailPath: imagePath,
              status: "PUBLISHED",
              language: "Bangla",
              access: "PREMIUM",
            },
            admin.jar,
          );
          assert.equal(edited.status, 200);
          assert.equal(
            (
              await call(
                "/api/v1/me/progress",
                "POST",
                { slug: series.slug, episodeKey: "s1e1", position: 5 },
                normal.jar,
              )
            ).status,
            403,
          );
          const subId = mediaIds[1];
          const attached = await call(
            "/api/v1/admin/subtitles",
            "POST",
            {
              contentId: seriesId,
              episodeId: ids[1],
              mediaId: subId,
              language: "Bangla",
            },
            admin.jar,
          );
          assert.equal(attached.status, 201);
          assert.equal(
            (
              await call(
                `/api/v1/admin/seasons/${seasonId}`,
                "DELETE",
                undefined,
                admin.jar,
              )
            ).status,
            409,
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/episodes/${ids[0]}`,
                "DELETE",
                undefined,
                admin.jar,
              )
            ).status,
            200,
          );
        },
      );
      await suite.test(
        "homepage section order and banner edits reach public homepage",
        async () => {
          const section = await call(
            "/api/v1/admin/sections",
            "POST",
            {
              title: `Curated ${tag}`,
              slug: `curated-${tag}`,
              position: 0,
              active: true,
              contentIds: [contentId],
            },
            admin.jar,
          );
          assert.equal(section.status, 201);
          sectionIds.push(String((section.json.data as { id: string }).id));
          const banner = await call(
            "/api/v1/admin/banners",
            "POST",
            {
              contentId,
              imagePath,
              title: `Hero ${tag}`,
              description: "Admin-managed authorized title",
              watchPath: `/watch/${movie.slug}`,
              infoPath: `/titles/${movie.slug}`,
              position: 0,
              active: true,
            },
            admin.jar,
          );
          assert.equal(banner.status, 201);
          bannerIds.push(String((banner.json.data as { id: string }).id));
          const home = await call("/");
          assert.ok(home.text.includes(`Curated ${tag}`));
          assert.ok(home.text.includes(`Hero ${tag}`));
          const data = (await call("/api/v1/homepage")).json.data as {
            sections: { title: string }[];
          };
          assert.ok(data.sections.some((s) => s.title === `Curated ${tag}`));
        },
      );
      await suite.test(
        "super-admin-only plan/coupon writes and immutable provider payment status",
        async () => {
          const plan = {
            slug: `plan-${tag}`,
            name: `Plan ${tag}`,
            price: 19900,
            currency: "BDT",
            durationDays: 30,
            features: ["Feature one"],
            active: false,
          };
          assert.equal(
            (await call("/api/v1/admin/plans", "POST", plan, admin.jar)).status,
            403,
          );
          const created = await call(
            "/api/v1/admin/plans",
            "POST",
            plan,
            superUser.jar,
          );
          assert.equal(created.status, 201);
          planIds.push(String((created.json.data as { id: string }).id));
          const coupon = await call(
            "/api/v1/admin/coupons",
            "POST",
            {
              code: `CMS_${tag.toUpperCase()}`,
              percent: 15,
              expiresAt: null,
              usageLimit: 20,
              active: false,
            },
            superUser.jar,
          );
          assert.equal(coupon.status, 201);
          couponIds.push(String((coupon.json.data as { id: string }).id));
          assert.equal(
            (
              await call(
                "/api/v1/admin/payments/fake",
                "PATCH",
                { status: "VERIFIED" },
                superUser.jar,
              )
            ).status,
            405,
          );
          assert.equal(
            (
              await call(
                "/api/v1/admin/subscriptions/fake",
                "PATCH",
                { status: "ACTIVE" },
                superUser.jar,
              )
            ).status,
            405,
          );
          assert.equal(
            (await call("/api/v1/admin/payments", "GET", undefined, admin.jar))
              .status,
            200,
          );
          assert.equal(
            (
              await call(
                "/api/v1/admin/subscriptions",
                "GET",
                undefined,
                admin.jar,
              )
            ).status,
            200,
          );
        },
      );
      await suite.test(
        "account suspension revokes sessions and admin cannot escalate roles",
        async () => {
          assert.equal(
            (
              await call(
                `/api/v1/admin/users/${normal.user.id}`,
                "PATCH",
                { role: "ADMIN" },
                admin.jar,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/users/${superUser.user.id}`,
                "PATCH",
                { role: "USER" },
                superUser.jar,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/users/${normal.user.id}`,
                "PATCH",
                { suspended: true },
                admin.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (await call("/api/v1/me/profile", "GET", undefined, normal.jar))
              .status,
            401,
          );
          assert.equal(
            (
              await call(
                "/api/auth/sign-in/email",
                "POST",
                { email: normal.email, password },
                normal.jar,
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/users/${normal.user.id}`,
                "PATCH",
                { suspended: false },
                admin.jar,
              )
            ).status,
            200,
          );
          const detail = await call(
            `/api/v1/admin/users/${normal.user.id}`,
            "GET",
            undefined,
            admin.jar,
          );
          assert.equal(detail.status, 200);
          for (const forbidden of ["password", "accessToken", "sessionToken"])
            assert.ok(!detail.text.includes(forbidden));
        },
      );
      await suite.test(
        "settings are validated, applied publicly and restricted to Super Admin",
        async () => {
          const row = await db.platformSetting.findUnique({
            where: { key: "brand" },
          });
          originalBrand = row?.value;
          const current = (
            await call(
              "/api/v1/admin/settings",
              "GET",
              undefined,
              superUser.jar,
            )
          ).json.data;
          const brand = settingsSchema.parse({
            ...(current as object),
            name: `Frame Test ${tag}`,
            seoTitle: `Frame CMS ${tag}`,
          });
          assert.equal(
            (
              await call(
                "/api/v1/admin/settings",
                "PATCH",
                { ...brand, color: "javascript:bad" },
                superUser.jar,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await call(
                "/api/v1/admin/settings",
                "PATCH",
                brand,
                superUser.jar,
              )
            ).status,
            200,
          );
          brandChanged = true;
          assert.ok((await call("/")).text.includes(`Frame CMS ${tag}`));
          assert.equal(
            (await call("/api/v1/admin/settings", "PATCH", brand, admin.jar))
              .status,
            403,
          );
          assert.equal(
            (
              await call(
                "/api/v1/admin/settings",
                "PATCH",
                { ...brand, maintenance: true },
                superUser.jar,
              )
            ).status,
            200,
          );
          assert.ok((await call("/")).text.includes("We will be back soon."));
          assert.equal(
            (await call("/admin", "GET", undefined, superUser.jar)).status,
            200,
          );
        },
      );
      await suite.test(
        "analytics use records; notifications and mutation audit logs are available",
        async () => {
          const analytics = await call(
            "/api/v1/admin/overview?days=30",
            "GET",
            undefined,
            admin.jar,
          );
          assert.equal(analytics.status, 200);
          const stats = (
            analytics.json.data as { stats: Record<string, number> }
          ).stats;
          assert.equal(stats["Total users"], await db.user.count());
          const notification = await call(
            "/api/v1/admin/notifications",
            "POST",
            {
              userId: admin.user.id,
              title: `Notification ${tag}`,
              body: "Isolated notification fixture",
            },
            admin.jar,
          );
          assert.equal(notification.status, 201);
          const id = String((notification.json.data as { id: string }).id);
          assert.equal(
            (
              await call(
                `/api/v1/admin/notifications/${id}/read`,
                "POST",
                {},
                admin.jar,
              )
            ).status,
            200,
          );
          const logs = await db.auditLog.findMany({
            where: { userId: { in: users } },
          });
          assert.ok(logs.some((v) => v.action === "ADMIN_CONTENT_CREATED"));
          assert.ok(logs.some((v) => v.action === "ADMIN_SETTINGS_UPDATED"));
          assert.ok(logs.some((v) => v.action === "ADMIN_USER_UPDATED"));
          assert.equal(
            (
              await call(
                "/api/v1/admin/content?page=-1",
                "GET",
                undefined,
                admin.jar,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await call(
                "/api/v1/admin/content?type=series",
                "GET",
                undefined,
                admin.jar,
              )
            ).status,
            200,
          );
        },
      );
      await suite.test(
        "all admin pages and collection APIs render for an authorized Super Admin",
        async () => {
          for (const resource of [
            "content",
            "series",
            "media",
            "genres",
            "categories",
            "sections",
            "banners",
            "users",
            "plans",
            "subscriptions",
            "payments",
            "coupons",
            "analytics",
            "settings",
            "notifications",
            "logs",
            "seasons",
            "episodes",
            "assets",
            "subtitles",
          ]) {
            assert.equal(
              (
                await call(
                  `/admin/${resource}`,
                  "GET",
                  undefined,
                  superUser.jar,
                )
              ).status,
              200,
              resource,
            );
          }
          for (const resource of [
            "content",
            "media",
            "genres",
            "categories",
            "sections",
            "banners",
            "users",
            "plans",
            "subscriptions",
            "payments",
            "coupons",
            "notifications",
            "logs",
            "seasons",
            "episodes",
            "assets",
            "subtitles",
          ]) {
            assert.equal(
              (
                await call(
                  `/api/v1/admin/${resource}`,
                  "GET",
                  undefined,
                  superUser.jar,
                )
              ).status,
              200,
              resource,
            );
          }
        },
      );
      await suite.test(
        "deletion removes unused drafts but protects published records",
        async () => {
          assert.equal(
            (
              await call(
                `/api/v1/admin/content/${contentId}`,
                "DELETE",
                undefined,
                admin.jar,
              )
            ).status,
            409,
          );
          const draft = await call(
            "/api/v1/admin/content",
            "POST",
            payload("delete"),
            admin.jar,
          );
          assert.equal(draft.status, 201);
          const id = String((draft.json.data as { id: string }).id);
          contentIds.push(id);
          assert.equal(
            (
              await call(
                `/api/v1/admin/content/${id}`,
                "DELETE",
                undefined,
                admin.jar,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await call(
                `/api/v1/admin/content/${id}`,
                "GET",
                undefined,
                admin.jar,
              )
            ).status,
            404,
          );
          await db.session.updateMany({
            where: { userId: admin.user.id },
            data: { expiresAt: new Date(Date.now() - 1000) },
          });
          assert.equal(
            (await call("/api/v1/admin/content", "GET", undefined, admin.jar))
              .status,
            401,
          );
        },
      );
    } finally {
      if (brandChanged) {
        if (originalBrand)
          await db.platformSetting.upsert({
            where: { key: "brand" },
            create: { key: "brand", value: originalBrand as never },
            update: { value: originalBrand as never },
          });
        else await db.platformSetting.deleteMany({ where: { key: "brand" } });
      }
      await db.contentBanner.deleteMany({ where: { id: { in: bannerIds } } });
      await db.homepageSection.deleteMany({
        where: { id: { in: sectionIds } },
      });
      await db.content.deleteMany({ where: { id: { in: contentIds } } });
      await db.genre.deleteMany({ where: { id: { in: genreIds } } });
      await db.category.deleteMany({ where: { id: { in: categoryIds } } });
      await db.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
      await db.coupon.deleteMany({ where: { id: { in: couponIds } } });
      for (const id of mediaIds) {
        const media = await db.mediaUpload.findUnique({ where: { id } });
        if (media?.provider === "LOCAL") {
          const { unlink } = await import("node:fs/promises");
          await unlink(`.local/media/${media.storageKey}`).catch(() => {});
        }
        await db.mediaUpload.deleteMany({ where: { id } });
      }
      await db.person.deleteMany({
        where: {
          name: { in: ["Authorized Actor", "Authorized Director"] },
          cast: { none: {} },
          crew: { none: {} },
        },
      });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    }
  },
);
