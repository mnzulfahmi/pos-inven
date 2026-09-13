"use client";
import { useState } from "react";
import { useBusiness } from "./business-provider";

const labels: Record<string, string> = {
  sales: "transaksi",
  shifts: "shift",
  customers: "pelanggan",
  suppliers: "pemasok",
  purchases: "pembelian",
  counts: "opname",
  refunds: "refund",
  expenses: "pengeluaran",
  ledger: "mutasi stok",
  invoices: "tagihan",
  audit: "audit",
};
export function HistoryPaging({ path }: { path: string }) {
  const { state, loadMore } = useBusiness();
  const [busy, setBusy] = useState(false);
  const collections = path.startsWith("/transactions")
    ? ["sales", "refunds"]
    : path.startsWith("/inventory")
      ? ["ledger", "counts"]
      : path.startsWith("/purchases")
        ? ["purchases", "suppliers"]
        : path.startsWith("/customers")
          ? ["customers", "sales"]
          : path.startsWith("/settings")
            ? ["invoices", "audit"]
            : path.startsWith("/reports")
              ? ["expenses"]
              : path.startsWith("/pos")
                ? ["shifts", "customers"]
                : [];
  const remaining = collections.filter(
    (kind) => state.remote?.pages?.[kind] != null,
  );
  if (!remaining.length) return null;
  return (
    <aside className="panel" style={{ margin: 24, padding: 20 }}>
      <p>
        Daftar, pencarian, dan ekspor tabel mencakup data yang telah dimuat.
        Ringkasan laporan tetap menghitung seluruh periode dari database.
      </p>
      {remaining.map((kind) => (
        <button
          key={kind}
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await loadMore(kind);
            } finally {
              setBusy(false);
            }
          }}
        >
          Muat 100 {labels[kind]} berikutnya
        </button>
      ))}
    </aside>
  );
}
