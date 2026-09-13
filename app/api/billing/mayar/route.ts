import { cookies } from "next/headers";
import { z } from "zod";
import {
  failure,
  resolveTenantId,
  rpc,
  sameOrigin,
  serverClient,
} from "@/lib/insforge/server";
import {
  assertMayarConfigured,
  createMayarInvoice,
  findMayarInvoice,
} from "@/lib/mayar";

export const dynamic = "force-dynamic";

const checkout = z
  .object({
    planId: z.enum(["starter-v1", "pro-v1", "business-v1"]),
    name: z.string().trim().min(2).max(100),
    email: z.email(),
    mobile: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9 -]{7,18}[0-9]$/),
    key: z.uuid(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    assertMayarConfigured({ webhook: true });
    const bodyText = await request.text();
    if (bodyText.length > 10_000) throw new Error("REQUEST_TOO_LARGE");
    const input = checkout.parse(JSON.parse(bodyText));
    const { data, error } = await (await serverClient()).auth.getCurrentUser();
    if (error || !data?.user) throw new Error("LOGIN_REQUIRED");
    const session = await rpc("nusa_session");
    const tenantId = resolveTenantId(
      session,
      (await cookies()).get("nusa_tenant")?.value,
    );
    const created = await rpc("nusa_command", {
      t: tenantId,
      op: "request-invoice",
      p: { planId: input.planId },
      k: input.key,
    });
    const invoice = await rpc("nusa_billing_prepare", {
      t: tenantId,
      p: { invoiceId: created.id },
    });
    if (invoice.payment_url)
      return Response.json({
        invoiceId: invoice.id,
        checkoutUrl: invoice.payment_url,
      });

    const origin = process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
      : new URL(request.url).origin;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const remote =
      (await findMayarInvoice(input.email, invoice.id)) ||
      (await createMayarInvoice({
        name: input.name,
        email: input.email,
        mobile: input.mobile.replace(/[ -]/g, ""),
        redirectUrl: `${origin}/settings?billing=1&invoice=${encodeURIComponent(invoice.id)}`,
        description: `Langganan Nusa ${invoice.planName} selama 1 bulan`,
        expiredAt: expiresAt,
        amount: Number(invoice.amount),
        invoiceId: invoice.id,
        tenantId,
        planId: invoice.plan_id,
        planName: invoice.planName,
      }));
    await rpc("nusa_billing_bind", {
      t: tenantId,
      p: { invoiceId: invoice.id, ...remote },
    });
    return Response.json({
      invoiceId: invoice.id,
      checkoutUrl: remote.paymentUrl,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /^(MAYAR_API_KEY|MAYAR_WEBHOOK_SECRET|INSFORGE_API_KEY)_MISSING$/.test(
        error.message,
      )
    )
      return Response.json(
        {
          error:
            "Pembayaran Mayar belum dikonfigurasi lengkap oleh administrator.",
          code: error.message,
        },
        { status: 503 },
      );
    return failure(error);
  }
}
