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
      String(body?.messages || body?.message || "MAYAR_REQUEST_FAILED"),
    ) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }
  return body;
}

export type MayarInvoiceInput = {
  name: string;
  email: string;
  mobile: string;
  redirectUrl: string;
  description: string;
  expiredAt: string;
  amount: number;
  invoiceId: string;
  tenantId: string;
  planId: string;
  planName: string;
};

export async function createMayarInvoice(input: MayarInvoiceInput) {
  const response = await mayarRequest("/hl/v2/invoices/create", {
    method: "POST",
    body: {
      name: input.name,
      email: input.email,
      mobile: input.mobile,
      redirectUrl: input.redirectUrl,
      description: input.description,
      expiredAt: input.expiredAt,
      items: [
        {
          quantity: 1,
          rate: input.amount,
          description: `Langganan Nusa ${input.planName} - 1 bulan`,
        },
      ],
      extraData: {
        noCustomer: input.tenantId,
        idProd: input.planId,
        invoiceId: input.invoiceId,
        tenantId: input.tenantId,
        planId: input.planId,
      },
    },
  });
  const data = response?.data;
  if (
    !data ||
    typeof data.id !== "string" ||
    typeof data.transactionId !== "string" ||
    typeof data.link !== "string" ||
    !data.link.startsWith("https://")
  )
    throw new Error("MAYAR_RESPONSE_INVALID");
  return {
    providerInvoiceId: data.id,
    providerTransactionId: data.transactionId,
    paymentUrl: data.link,
    expiresAt:
      typeof data.expiredAt === "number"
        ? new Date(data.expiredAt).toISOString()
        : String(data.expiredAt || input.expiredAt),
  };
}

export async function findMayarInvoice(email: string, invoiceId: string) {
  const response = await mayarRequest(
    `/hl/v2/invoices/filter?email=${encodeURIComponent(email)}&limit=50`,
  );
  const rows = Array.isArray(response?.data) ? response.data : [];
  const row = rows.find(
    (item: MayarRecord) => item?.extraData?.invoiceId === invoiceId,
  );
  if (!row) return null;
  const id = row.id;
  const transactionId = row.transactionId;
  const link = row.link || row.invoiceUrl || row.paymentUrl;
  if (
    typeof id !== "string" ||
    typeof transactionId !== "string" ||
    typeof link !== "string" ||
    !link.startsWith("https://")
  )
    return null;
  return {
    providerInvoiceId: id,
    providerTransactionId: transactionId,
    paymentUrl: link,
    expiresAt:
      typeof row.expiredAt === "number"
        ? new Date(row.expiredAt).toISOString()
        : String(row.expiredAt || ""),
  };
}

export async function getMayarInvoice(providerInvoiceId: string) {
  const response = await mayarRequest(
    `/hl/v2/invoices/${encodeURIComponent(providerInvoiceId)}`,
  );
  return response?.data || response;
}

function records(value: unknown): MayarRecord[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(records);
  const record = value as MayarRecord;
  return [record, ...Object.values(record).flatMap(records)];
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
