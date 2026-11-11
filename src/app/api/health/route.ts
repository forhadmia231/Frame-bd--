export function GET() {
  return Response.json(
    {
      status: "ok",
      service: "frame-bd",
      phase: "backend-authentication",
      scope:
        "Application process only; database and external services are not configured.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
