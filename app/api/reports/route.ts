import { cookies } from "next/headers";
import { z } from "zod";
import { rpc, failure, resolveTenantId } from "@/lib/insforge/server";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url),
      session = await rpc("nusa_session"),
      t = resolveTenantId(session, (await cookies()).get("nusa_tenant")?.value);
    const o =
      url.searchParams.get("outlet") === "all"
        ? null
        : z.uuid().parse(url.searchParams.get("outlet"));
    const d = z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .parse(url.searchParams.get("period"));
    return Response.json(await rpc("nusa_report", { t, o, d }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
