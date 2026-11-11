import { endpoint } from "@/lib/api";
import { publicImage } from "@/modules/admin/media";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return endpoint(async () => publicImage((await context.params).id));
}
