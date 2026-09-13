import { z } from "zod";
import { rpc, failure, sameOrigin } from "@/lib/insforge/server";
export async function GET() {
  try {
    return Response.json(await rpc("nusa_operator_snapshot"), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await request.json();
    const { t, op, p, k } = z
      .object({
        t: z.uuid(),
        op: z.enum(["verify-invoice", "tenant-status"]),
        p: z.record(z.string(), z.unknown()),
        k: z.uuid(),
      })
      .parse(body);
    return Response.json(await rpc("nusa_command", { t, op, p, k }));
  } catch (e) {
    return failure(e);
  }
}
