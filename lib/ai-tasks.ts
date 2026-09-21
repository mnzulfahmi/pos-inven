export type ApprovalTaskRequest = "all" | "purchase" | "count";

export type AiApprovalTask = {
  id: string;
  kind: "purchase" | "count";
  operation: "approve-purchase" | "approve-count";
  title: string;
  description: string;
  outletId: string;
  lines: { label: string; caption: string; value: string }[];
  payload: { id: string; version?: number };
  canApprove: boolean;
  requiredRole: string;
  targetHref: "/purchases" | "/inventory";
  status: "pending" | "completed";
};

const normalize = (value: string) => value.toLocaleLowerCase("id-ID").trim();

export function approvalTaskRequestFor(
  question: string,
): ApprovalTaskRequest | null {
  const value = normalize(question);
  const asksForApproval =
    /\b(setujui|persetujuan|approve|approval|konfirmasi|tinjau|review)\b/.test(
      value,
    );
  const asksForTasks =
    /\b(task|tugas|pekerjaan|antrean|antrian)\b/.test(value) ||
    /\b(yang|apa).{0,24}\b(menunggu|perlu).{0,24}\b(setujui|persetujuan|konfirmasi|ditinjau)\b/.test(
      value,
    );
  if (!asksForApproval && !asksForTasks) return null;
  if (/\b(opname|stock count|koreksi stok)\b/.test(value)) return "count";
  if (/\b(po|purchase order|pesanan pembelian|pembelian)\b/.test(value))
    return "purchase";
  return "all";
}

export function proposalReviewRequest(question: string) {
  const value = normalize(question);
  return (
    /\b(konfirmasi|setujui|approve|lanjutkan|tinjau)\b.{0,30}\b(usulan|proposal|draft|tadi|ini)\b/.test(
      value,
    ) || /^(konfirmasi|setujui|approve|lanjutkan|tinjau)[.!]?$/i.test(value)
  );
}

const rupiah = (value: unknown) =>
  `Rp${Math.round(Number(value || 0)).toLocaleString("id-ID")}`;

export function buildApprovalTasks(
  raw: Record<string, any> | undefined,
  products: { id: string; name: string }[],
  suppliers: { id: string; name: string }[],
  request: ApprovalTaskRequest,
): AiApprovalTask[] {
  if (!raw) return [];
  const role = String(raw.role || "").toLowerCase();
  const canApprove = role === "owner";
  const productName = (id: string) =>
    products.find((product) => product.id === id)?.name || "Produk";
  const tasks: AiApprovalTask[] = [];

  if (request !== "count") {
    for (const purchase of raw.purchases || []) {
      if (purchase.status !== "draft") continue;
      const supplier =
        suppliers.find((item) => item.id === purchase.supplier_id)?.name ||
        "Pemasok belum dikenali";
      tasks.push({
        id: purchase.id,
        kind: "purchase",
        operation: "approve-purchase",
        title: `Setujui pesanan ${purchase.id}`,
        description: `Draft dari ${supplier}`,
        outletId: purchase.outlet_id,
        lines: (purchase.lines || []).map((line: any) => ({
          label: productName(line.variant_id),
          caption: "Jumlah × harga beli",
          value: `${Number(line.quantity).toLocaleString("id-ID")} × ${rupiah(line.cost)}`,
        })),
        payload: { id: purchase.id, version: Number(purchase.version) },
        canApprove,
        requiredRole: "Owner / Business Owner",
        targetHref: "/purchases",
        status: "pending",
      });
    }
  }

  if (request !== "purchase") {
    for (const count of raw.counts || []) {
      if (count.status !== "pending") continue;
      tasks.push({
        id: count.id,
        kind: "count",
        operation: "approve-count",
        title: `Setujui stock opname`,
        description: count.reason || "Penyesuaian stok menunggu tinjauan",
        outletId: count.outlet_id,
        lines: (count.lines || []).map((line: any) => ({
          label: productName(line.variant_id),
          caption: "Stok sistem → stok fisik",
          value: `${Number(line.expected).toLocaleString("id-ID")} → ${Number(line.physical).toLocaleString("id-ID")}`,
        })),
        payload: { id: count.id },
        canApprove,
        requiredRole: "Owner / Business Owner",
        targetHref: "/inventory",
        status: "pending",
      });
    }
  }

  return tasks.slice(0, 8);
}
