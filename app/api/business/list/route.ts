import { cookies } from "next/headers";
import { z } from "zod";
import { rpc, failure } from "@/lib/insforge/server";

export async function GET(request: Request) {
  try {
    const session = await rpc("nusa_session");
    const preferred = (await cookies()).get("nusa_tenant")?.value;
    const tenant =
      session.tenants.find((t: { id: string }) => t.id === preferred) ||
      session.tenants[0];
    if (!tenant) throw new Error("ONBOARDING_REQUIRED");
    const search = new URL(request.url).searchParams;
    const kind = z
      .enum([
        "products",
        "balances",
        "sales",
        "shifts",
        "customers",
        "suppliers",
        "purchases",
        "counts",
        "refunds",
        "expenses",
        "ledger",
        "invoices",
        "audit",
      ])
      .parse(search.get("kind"));
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(search.get("page") || 0);
    return Response.json(
      await rpc("nusa_list_page", { t: tenant.id, kind, page }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
