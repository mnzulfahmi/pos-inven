import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { adminRpc, failure } from "@/lib/insforge/server";
import {
  assertMayarConfigured,
  getMayarInvoice,
  isMayarInvoicePaid,
  mayarInvoiceAmount,
} from "@/lib/mayar";

export const dynamic = "force-dynamic";

const payloadSchema = z
  .object({
    event: z.string().max(100),
    data: z.record(z.string(), z.unknown()),
  })
  .passthrough();

function secretMatches(received: string, expected: string) {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ secret: string }> },
) {
  try {
    assertMayarConfigured({ webhook: true });
    const { secret } = await context.params;
    if (!secretMatches(secret, process.env.MAYAR_WEBHOOK_SECRET!))
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    const bodyText = await request.text();
    if (bodyText.length > 128_000) throw new Error("REQUEST_TOO_LARGE");
    const payload = payloadSchema.parse(JSON.parse(bodyText));
    if (payload.event !== "payment.received")
      return Response.json({ received: true, ignored: true });

    const data = payload.data as Record<string, any>;
    // Mayar webhook payloads do not include extraData — that field is only
    // present on the invoice detail response from the Mayar API.  The webhook
    // uses data.productId as the Mayar invoice ID (providerInvoiceId) and
    // data.transactionId / data.id as the transaction ID.
    const providerInvoiceId =
      typeof data.productId === "string" ? data.productId.trim() : "";
    const providerTransactionId =
      typeof data.transactionId === "string"
        ? data.transactionId.trim()
        : typeof data.id === "string"
          ? data.id.trim()
          : "";
    if (!providerInvoiceId && !providerTransactionId)
      return Response.json({ received: true, unmatched: true });

    const lookup = await adminRpc("nusa_mayar_lookup", {
      p: {
        invoiceId: "",
        providerInvoiceId,
        providerTransactionId,
      },
    });
    if (!lookup) return Response.json({ received: true, unmatched: true });

    // Use the provider invoice ID from the lookup record if available;
    // otherwise fall back to the ID from the webhook payload itself.
    const resolvedProviderInvoiceId: string =
      lookup.providerInvoiceId || providerInvoiceId;
    if (!resolvedProviderInvoiceId)
      return Response.json({ received: true, unmatched: true });

    const providerInvoice = await getMayarInvoice(resolvedProviderInvoiceId);
    if (!isMayarInvoicePaid(providerInvoice))
      return Response.json({ received: true, pending: true });
    const paidAmount = mayarInvoiceAmount(providerInvoice);
    if (paidAmount == null) throw new Error("MAYAR_AMOUNT_MISSING");
    await adminRpc("nusa_mayar_complete", {
      p: {
        invoiceId: lookup.id,
        providerInvoiceId: lookup.providerInvoiceId,
        providerTransactionId: lookup.providerTransactionId,
        amount: paidAmount,
      },
    });
    return Response.json({ received: true, activated: true });
  } catch (error) {
    return failure(error);
  }
}
