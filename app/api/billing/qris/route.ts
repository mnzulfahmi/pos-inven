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
  createMayarPayment,
  createMayarQris,
} from "@/lib/mayar";

export const dynamic = "force-dynamic";

const checkoutBody = z
  .object({
    planId: z.enum(["starter-v1", "pro-v1", "business-v1", "trial-v1"]),
    name: z.string().trim().min(2).max(100),
    email: z.email(),
    mobile: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{9,15}$/),
    key: z.uuid(),
  })
  .strict();

async function authenticatedTenant() {
  const { data, error } = await (await serverClient()).auth.getCurrentUser();
  if (error || !data?.user) throw new Error("LOGIN_REQUIRED");
  const session = await rpc("nusa_session");
  return resolveTenantId(
    session,
    (await cookies()).get("nusa_tenant")?.value,
  );
}

/** POST /api/billing/qris — create invoice + generate QRIS image URL */
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    assertMayarConfigured({ webhook: true });
    const bodyText = await request.text();
    if (bodyText.length > 10_000) throw new Error("REQUEST_TOO_LARGE");
    const input = checkoutBody.parse(JSON.parse(bodyText));
    const tenantId = await authenticatedTenant();

    // Create or reuse the local invoice record
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

    const origin = process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
      : new URL(request.url).origin;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Ensure a Mayar payment request exists (needed for webhook activation)
    const remote = await createMayarPayment({
      name: input.name,
      email: input.email,
      mobile: input.mobile.replace(/[ -]/g, ""),
      description: `Langganan Nusa ${invoice.planName} selama 1 bulan`,
      redirectUrl: `${origin}/pricing?billing=return&invoice=${encodeURIComponent(invoice.id)}`,
      expiredAt: expiresAt,
      amount: Number(invoice.amount),
      invoiceId: invoice.id,
      tenantId,
      planId: invoice.plan_id,
    });

    await rpc("nusa_billing_bind", {
      t: tenantId,
      p: { invoiceId: invoice.id, ...remote },
    });

    // Generate a fresh QRIS image for the invoice amount
    const qrisImageUrl = await createMayarQris(Number(invoice.amount));

    return Response.json({
      invoiceId: invoice.id,
      qrisImageUrl,
      amount: Number(invoice.amount),
      expiresAt: remote.expiresAt || expiresAt,
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
            "Pembayaran QRIS belum dikonfigurasi lengkap oleh administrator.",
          code: error.message,
        },
        { status: 503 },
      );
    return failure(error);
  }
}

/** GET /api/billing/qris?invoice=<uuid> — poll invoice payment status */
export async function GET(request: Request) {
  try {
    const invoiceId = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("invoice"));
    const tenantId = await authenticatedTenant();
    const snapshot = await rpc("nusa_snapshot", { t: tenantId });
    const invoice = snapshot.invoices?.find(
      (item: Record<string, unknown>) => item.id === invoiceId,
    );
    if (!invoice) throw new Error("INVOICE_NOT_FOUND");
    return Response.json(
      {
        id: invoice.id,
        planId: invoice.plan_id,
        amount: Number(invoice.amount),
        status: invoice.status,
        paymentUrl: invoice.payment_url || "",
        expiresAt: invoice.expires_at || null,
        paidAt: invoice.paid_at || null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
