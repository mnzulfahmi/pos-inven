import { cookies } from "next/headers";
import { z } from "zod";
import {
  rpc,
  serverClient,
  failure,
  sameOrigin,
  resolveTenantId,
} from "@/lib/insforge/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { data, error } = await (await serverClient()).auth.getCurrentUser();
    if (error || !data?.user)
      return Response.json({ error: "LOGIN_REQUIRED" }, { status: 401 });
    const session = await rpc("nusa_session");
    const preferred = (await cookies()).get("nusa_tenant")?.value;
    const tenant =
      session.tenants.find((t: { id: string }) => t.id === preferred) ||
      session.tenants[0];
    const raw = tenant ? await rpc("nusa_snapshot", { t: tenant.id }) : null;
    if (raw)
      raw.productImages = await rpc("nusa_product_images", { t: tenant.id });
    return Response.json(
      { session, raw },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await request.text();
    if (body.length > 270000) throw new Error("REQUEST_TOO_LARGE");
    const { op, p = {}, key } = JSON.parse(body);
    const jar = await cookies();
    if (op === "onboard") {
      const result = await rpc("nusa_onboard", { p, k: z.uuid().parse(key) });
      jar.set("nusa_tenant", result.tenantId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      return Response.json(result);
    }
    if (op === "accept-invite") {
      const result = await rpc("nusa_accept_invite", {
        token: z.string().min(40).max(200).parse(p.token),
      });
      jar.set("nusa_tenant", result.tenantId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      return Response.json(result);
    }
    if (op === "switch-tenant") {
      await rpc("nusa_snapshot", { t: z.uuid().parse(p.tenantId) });
      jar.set("nusa_tenant", p.tenantId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      return Response.json({ ok: true });
    }
    const session = await rpc("nusa_session");
    const t = resolveTenantId(session, jar.get("nusa_tenant")?.value);
    if (op === "set-product-image")
      return Response.json(
        await rpc("nusa_set_product_image", {
          t,
          v: z.uuid().parse(p.variantId),
          f: p.fileId ? z.uuid().parse(p.fileId) : null,
        }),
      );
    const result =
      op === "quote"
        ? await rpc("nusa_quote", { t, o: z.uuid().parse(p.outletId), p })
        : await rpc("nusa_command", {
            t,
            op: z.string().max(40).parse(op),
            p,
            k: z.uuid().parse(key),
          });
    return Response.json(result);
  } catch (e) {
    return failure(e);
  }
}
