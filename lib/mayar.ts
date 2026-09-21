import "server-only";

type MayarRecord = Record<string, any>;

const apiBase = () => {
  const value = process.env.MAYAR_API_URL || "https://api.mayar.id";
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("MAYAR_API_URL_INVALID");
  return url.origin;
};

export function assertMayarConfigured(options: { webhook?: boolean } = {}) {
  if (!process.env.MAYAR_API_KEY) throw new Error("MAYAR_API_KEY_MISSING");
  if (options.webhook) {
    if (!process.env.MAYAR_WEBHOOK_SECRET)
      throw new Error("MAYAR_WEBHOOK_SECRET_MISSING");
    if (!process.env.INSFORGE_API_KEY)
      throw new Error("INSFORGE_API_KEY_MISSING");
  }
}

async function mayarRequest(
  path: string,
  options: { method?: "GET" | "POST"; body?: MayarRecord } = {},
) {
  assertMayarConfigured();
  const response = await fetch(`${apiBase()}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${process.env.MAYAR_API_KEY}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      response.status === 401
        ? "MAYAR_UNAUTHORIZED"
        : String(body?.messages || body?.message || "MAYAR_REQUEST_FAILED"),
    ) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }
  return body;
}

export type MayarPaymentInput = {
  name: string;
  email: string;
  mobile: string;
  description: string;
  redirectUrl: string;
  expiredAt: string;
  amount: number;
  invoiceId: string;
  tenantId: string;
  planId: string;
};

// Keep old alias so callers that were renamed can still compile.
export type MayarInvoiceInput = MayarPaymentInput;

export async function createMayarPayment(input: MayarPaymentInput) {
  // Use /hl/v2/payments/create (Single Payment Request) instead of
  // /hl/v2/invoices/create.  Payments support redirectUrl natively and have a
  // simpler request body with no per-item breakdown or extraData validation
  // issues.  The hosted Mayar UI at data.link handles the checkout experience.
  const response = await mayarRequest("/hl/v2/payments/create", {
    method: "POST",
    body: {
      name: `Langganan Nusa - ${input.name}`,
      amount: input.amount,
      email: input.email,
      mobile: input.mobile,
      description: input.description,
      redirectUrl: input.redirectUrl,
      expiredAt: input.expiredAt,
      extraData: {
        noCustomer: input.tenantId,
        idProd: input.planId,
      },
    },
  });
  const data = response?.data;
  if (
    !data ||
    typeof data.id !== "string" ||
    typeof data.transactionId !== "string" ||
    typeof data.link !== "string"
  )
    throw new Error("MAYAR_RESPONSE_INVALID");
  // link may be a full URL or just a slug — normalise to full URL.
  const paymentUrl = data.link.startsWith("https://")
    ? data.link
    : `${apiBase()}/pl/${data.link}`;
  return {
    providerInvoiceId: data.id,
    providerTransactionId: data.transactionId,
    paymentUrl,
    expiresAt: input.expiredAt,
  };
}

// Keep old name as alias so any remaining callers still compile.
export const createMayarInvoice = createMayarPayment;

export async function getMayarPayment(providerInvoiceId: string) {
  const response = await mayarRequest(
    `/hl/v2/payments/${encodeURIComponent(providerInvoiceId)}`,
  );
  return response?.data || response;
}

// Keep old name as alias.
export const getMayarInvoice = getMayarPayment;

function records(value: unknown): MayarRecord[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(records);
  const record = value as MayarRecord;
  return [record, ...Object.values(record).flatMap(records)];
}

export async function createMayarQris(amount: number): Promise<string> {
  const response = await mayarRequest("/hl/v1/qrcode/create", {
    method: "POST",
    body: { amount },
  });
  const url = response?.data?.url;
  if (typeof url !== "string" || !url.startsWith("https://"))
    throw new Error("MAYAR_QRIS_RESPONSE_INVALID");
  return url;
}

export function isMayarInvoicePaid(invoice: unknown) {
  return records(invoice).some((record) => {
    const statusValues = Object.entries(record)
      .filter(([key]) => /status|paid/i.test(key))
      .map(([, value]) => value);
    return statusValues.some(
      (value) =>
        value === true ||
        ["paid", "success", "successful", "completed"].includes(
          String(value).toLowerCase(),
        ),
    );
  });
}

export function mayarInvoiceAmount(invoice: unknown): number | null {
  for (const record of records(invoice)) {
    for (const key of ["amount", "totalAmount", "grandTotal", "total"]) {
      const value = Number(record[key]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
    if (Array.isArray(record.items)) {
      const amount = record.items.reduce(
        (sum: number, item: MayarRecord) =>
          sum + Number(item.quantity || 0) * Number(item.rate || 0),
        0,
      );
      if (Number.isFinite(amount) && amount >= 0) return amount;
    }
  }
  return null;
}
