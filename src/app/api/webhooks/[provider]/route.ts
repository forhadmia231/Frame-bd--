import { endpoint, ok, ApiError, readText } from "@/lib/api";
import { processPaymentWebhook } from "@/modules/subscriptions/webhooks";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  return endpoint(async () => {
    const raw = await readText(request, 262144);
    if (Buffer.byteLength(raw) > 262144)
      throw new ApiError(413, "BODY_TOO_LARGE", "Webhook too large.");
    return ok(
      await processPaymentWebhook(
        (await params).provider,
        raw,
        request.headers,
      ),
    );
  });
}
