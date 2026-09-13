import {
  getSummary,
  getLowStock,
  money,
  number,
  outletName,
  periodLabel,
  previousLabel,
  type OutletId,
  type Period,
} from "./demo-data";
import { liveSummary, liveLowStock, type BusinessState } from "./operations";
import { plans, demoSubscription } from "./plans";
import type { AiApprovalTask } from "./ai-tasks";

export type ReplyKind =
  "sales" | "stock" | "po" | "correction" | "pricing" | "help";
export type Message = {
  source?: {
    outlet: string;
    periodDays: number;
    asOf: string;
    timezone: string;
  };
  proposal?: {
    id: string;
    operation: string;
    payload: any;
    expires_at: string;
    result?: any;
  };
  tasks?: AiApprovalTask[];
  id: string;
  role: "user" | "assistant";
  text: string;
  kind?: ReplyKind;
  requestedQty?: number;
  productId?: string;
  confirmed?: boolean;
  savedOutlet?: string;
  savedReason?: string;
};
export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  local?: boolean;
};

export function makeDemoReply(
  text: string,
  outlet: OutletId,
  period: Period,
  business?: BusinessState,
): Message {
  const summary = business
    ? liveSummary(business, outlet, period)
    : getSummary(outlet, period);
  const low = business ? liveLowStock(business, outlet) : getLowStock(outlet);
  const empty = summary.count === 0;
  const normalized = text.toLowerCase();
  if (
    /paket|harga|langganan|starter|\bpro\b|business|kuota|trial|pricing|subscription/.test(
      normalized,
    )
  ) {
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      kind: "pricing",
      text: `Nusa memiliki tiga pilihan paket bulanan:\n\n${plans.map((plan) => `${plan.name} — ${money(plan.price)}/bulan: ${plan.outlets} outlet, ${plan.members} anggota aktif, dan ${number(plan.messages)} pesan AI per bulan.`).join("\n\n")}\n\nUntuk Toko Nusantara yang memiliki ${demoSubscription.activeOutlets} outlet dan ${demoSubscription.activeMembers} anggota aktif, Pro adalah kapasitas terkecil yang mencukupi. Starter memerlukan penyesuaian outlet dan anggota terlebih dahulu.\n\nHarga ini ilustrasi demo, belum menjadi harga komersial. Trial Pro menyediakan 100 pesan total selama 1–14 September 2026. Memilih paket tidak mengaktifkan langganan; aktivasi direncanakan setelah invoice diverifikasi.`,
    };
  }
  const kind: ReplyKind = /stok fisik|koreksi|opname/.test(normalized)
    ? "correction"
    : /\bpo\b|draft|pembelian|pesan\s+\d/.test(normalized)
      ? "po"
      : /restock|stok|persediaan/.test(normalized)
        ? "stock"
        : /jual|omzet|laris|transaksi|laba|ringkasan|bisnis/.test(normalized)
          ? "sales"
          : "help";
  const productId = /susu/.test(normalized)
    ? "milk"
    : /kopi/.test(normalized)
      ? "coffee"
      : /beras/.test(normalized)
        ? "rice"
        : /minyak/.test(normalized)
          ? "oil"
          : /indomie|mi goreng/.test(normalized)
            ? "noodle"
            : undefined;
  const requestedQty = normalized.match(
    /(?:^|\s)(-?\d+(?:[.,]\d+)?)(?=\s|$|[.!?])/,
  );
  const quantity = requestedQty
    ? Number(requestedQty[1].replace(",", "."))
    : undefined;
  if (
    (kind === "po" || kind === "correction") &&
    quantity !== undefined &&
    (!Number.isInteger(quantity) ||
      quantity < (kind === "po" ? 1 : 0) ||
      quantity > 10000)
  ) {
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      kind: "help",
      text: `Gunakan jumlah unit bulat antara ${kind === "po" ? "1" : "0"} dan 10.000 untuk simulasi ini. Contoh: “Buat draft PO 24 susu”.`,
    };
  }
  if (
    (kind === "correction" && (!productId || quantity === undefined)) ||
    (kind === "po" && quantity !== undefined && !productId)
  ) {
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      kind: "help",
      text: "Sebutkan produk dan jumlah unit yang ingin ditinjau. Contoh: “Buat draft PO 24 susu” atau “Stok fisik kopi ternyata 18”.",
    };
  }
  const noContext =
    empty &&
    (kind === "sales" || kind === "help" || (kind === "stock" && !low.length));
  const textContent = noContext
    ? `Belum ada data yang cocok untuk analisis ini di ${outletName(outlet)}. Pilih Outlet Dago atau Cihampelas untuk mencoba analisis dengan data demo.`
    : kind === "sales"
      ? `Berikut ringkasan ${outletName(outlet).toLowerCase()} untuk ${periodLabel(period)}. Penjualan bersih mencapai ${money(summary.sales)} dari ${number(summary.count)} transaksi. ${summary.salesGrowth === null ? "Belum ada pembanding yang dapat dihitung." : `Nilainya ${summary.salesGrowth >= 0 ? "naik" : "turun"} ${Math.abs(summary.salesGrowth).toFixed(1).replace(".", ",")}% dibanding ${previousLabel(period)} (${money(summary.previousSales)}).`}`
      : kind === "stock"
        ? `Ada ${low.length} stok produk yang sudah mencapai batas minimum di ${outletName(outlet).toLowerCase()}. Berikut prioritas yang bisa Anda tinjau sebelum melakukan pembelian.`
        : kind === "po"
          ? "Saya sudah menyiapkan usulan pembelian dari data persediaan. Pilih outlet dan periksa jumlah serta estimasi biayanya sebelum menyimpan draft demo."
          : kind === "correction"
            ? "Mari tinjau usulan koreksi stok terlebih dahulu. Pilih outlet dan isi alasan penghitungan. Konfirmasi hanya menyimpan usulan demo; persetujuan dan perubahan saldo dilakukan melalui Inventori → Stok opname."
            : "Saya bisa membantu menganalisis penjualan, melihat produk terlaris, merekomendasikan restock, dan menyiapkan draft PO. Di demo ini, jawaban dibuat dari data contoh dengan pola pertanyaan yang tersedia. Coba “Bagaimana penjualan saya?” atau “Buat draft PO 24 susu”.";
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    kind: noContext ? "help" : kind,
    text: textContent,
    requestedQty: quantity,
    productId,
  };
}
