"use client";
import { useState } from "react";
import { Printer, RotateCcw, ReceiptText } from "lucide-react";
import { useBusiness } from "../business-provider";
import { useWorkspace } from "../workspace-context";
import { Modal } from "../ui";
import { money, outletName } from "@/lib/demo-data";
import { refund, refundQuote } from "@/lib/operations";
import {
  PageHeading,
  DemoNote,
  SearchBox,
  Field,
  NumericInput,
  Badge,
  ErrorNote,
  Empty,
  Stats,
  Receipt,
  ExportButton,
  csvDownload,
  FlowLink,
} from "./shared";
export function TransactionsPage() {
  const { state, commit } = useBusiness();
  const { outlet, notify } = useWorkspace();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("Semua"),
    [selected, setSelected] = useState(""),
    [refunding, setRefunding] = useState(false),
    [review, setReview] = useState(false),
    [qty, setQty] = useState<number[]>([]),
    [restock, setRestock] = useState<number[]>([]),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [manual, setManual] = useState(false);
  const label = (s: (typeof state.sales)[number]) =>
    s.lines.every((l) => l.refunded === l.quantity)
      ? "Refund penuh"
      : s.lines.some((l) => l.refunded)
        ? "Refund sebagian"
        : "Selesai";
  const rows = state.sales.filter(
    (s) =>
      (outlet === "all" || s.outlet === outlet) &&
      (status === "Semua" || label(s) === status) &&
      `${s.id} ${state.customers.find((c) => c.id === s.customer)?.name || "Umum"}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const sale = state.sales.find((s) => s.id === selected);
  const grossRefund = sale ? refundQuote(sale, qty) : 0;
  async function submit() {
    if (!sale) return;
    const r = await commit((s) => refund(s, sale.id, qty, restock, reason));
    if (!r.ok) setError(r.error);
    else {
      setRefunding(false);
      setReview(false);
      notify(
        state.remote?.role === "cashier"
          ? "Refund diajukan untuk persetujuan. Stok dan pembayaran belum berubah."
          : "Refund dicatat. Stok layak jual dikembalikan.",
      );
    }
  }
  return (
    <div className="ops-page">
      <PageHeading
        eyebrow="PENJUALAN"
        title="Transaksi"
        description="Setiap penjualan tercatat. Setiap pengembalian dapat ditelusuri."
      >
        <ExportButton
          onClick={() =>
            csvDownload("transaksi-.csv", [
              ["ID", "Outlet", "Pelanggan", "Metode", "Total", "Status"],
              ...rows.map((s) => [
                s.id,
                outletName(s.outlet),
                state.customers.find((c) => c.id === s.customer)?.name ||
                  "Umum",
                s.method,
                s.total,
                label(s),
              ]),
            ])
          }
        />
        <FlowLink href="/pos">Buka kasir</FlowLink>
      </PageHeading>
      <DemoNote />
      <Stats
        items={[
          {
            label: "Transaksi ditampilkan",
            value: rows.length,
            hint: "Dua transaksi contoh + penjualan sesi ini",
          },
          {
            label: "Nilai transaksi",
            value: money(rows.reduce((a, s) => a + s.total, 0)),
            hint: "Termasuk pajak, sebelum refund",
          },
          {
            label: "Pengembalian sesi ini",
            value: money(
              state.refunds
                .filter((r) => outlet === "all" || r.outlet === outlet)
                .reduce((a, r) => a + r.amount, 0),
            ),
            hint: "Diposting pada tanggal  hari ini",
          },
        ]}
      />
      <section className="panel">
        <div className="ops-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Cari ID transaksi atau pelanggan…"
          />
          <select
            aria-label="Filter status transaksi"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["Semua", "Selesai", "Refund sebagian", "Refund penuh"].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </select>
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Transaksi</th>
                <th>Pelanggan</th>
                <th>Outlet</th>
                <th>Metode</th>
                <th>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.id}</strong>
                    <small>{s.date}</small>
                  </td>
                  <td>
                    {state.customers.find((c) => c.id === s.customer)?.name ||
                      "Pelanggan umum"}
                  </td>
                  <td>{outletName(s.outlet)}</td>
                  <td>{s.method}</td>
                  <td>
                    <b>{money(s.total)}</b>
                  </td>
                  <td>
                    <Badge>{label(s)}</Badge>
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelected(s.id);
                        setRefunding(false);
                        setError("");
                      }}
                    >
                      Lihat detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty>
            <ReceiptText size={28} />
            <h3>Belum ada transaksi yang cocok</h3>
            <p>Coba filter lain atau buat penjualan di kasir.</p>
          </Empty>
        )}
        <p className="ops-table-foot">
          Riwayat ini menampilkan contoh transaksi dan aktivitas sesi, bukan
          seluruh agregat historis dashboard.
        </p>
      </section>
      <Modal
        wide
        open={!!sale}
        onOpenChange={() => setSelected("")}
        title={refunding ? "Pengembalian barang" : "Detail transaksi"}
        description={
          refunding
            ? "Owner · Refund memerlukan shift aktif pada outlet asal. Periksa barang yang benar-benar layak dijual kembali."
            : "Rincian pembayaran, barang, dan catatan refund dalam sesi ."
        }
      >
        {sale &&
          (refunding ? (
            <div className="ops-form">
              <Badge>
                {sale.id} · {sale.method}
              </Badge>
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Barang</th>
                      <th>Sisa</th>
                      <th>Refund</th>
                      <th>Kembali ke stok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.lines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.name}</td>
                        <td>{l.quantity - l.refunded}</td>
                        <td>
                          <NumericInput
                            aria-label={`Jumlah refund ${l.name}`}
                            min="0"
                            max={l.quantity - l.refunded}
                            disabled={review}
                            value={qty[i]}
                            onValueChange={(n) => {
                              setQty(qty.map((v, j) => (j === i ? n : v)));
                              setRestock(
                                restock.map((v, j) =>
                                  j === i ? Math.min(v, n) : v,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td>
                          <NumericInput
                            aria-label={`Stok kembali ${l.name}`}
                            min="0"
                            max={qty[i]}
                            disabled={review}
                            value={restock[i]}
                            onValueChange={(value) =>
                              setRestock(
                                restock.map((v, j) => (j === i ? value : v)),
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Field label="Alasan pengembalian">
                <textarea
                  disabled={review}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <div className="ops-review">
                <span>Total refund (termasuk pajak)</span>
                <strong>{money(grossRefund)}</strong>
              </div>
              {review && (
                <p className="info-note">
                  Konfirmasi akan mencatat refund pada hari ini dan menambah
                  stok hanya sejumlah kolom “Kembali ke stok”.
                </p>
              )}
              {sale.method !== "Tunai" && (
                <label className="ops-check">
                  <input
                    type="checkbox"
                    checked={manual}
                    onChange={(e) => setManual(e.target.checked)}
                  />{" "}
                  Pengembalian dana {sale.method} dikonfirmasi manual ().
                </label>
              )}
              <ErrorNote error={error} />
              <div className="dialog-actions">
                <button
                  className="button secondary"
                  onClick={() =>
                    review ? setReview(false) : setRefunding(false)
                  }
                >
                  Kembali
                </button>
                <button
                  className="button primary"
                  disabled={
                    !qty.some((q) => q > 0) ||
                    !reason.trim() ||
                    (sale.method !== "Tunai" && !manual)
                  }
                  onClick={() => {
                    if (review) submit();
                    else {
                      const check = structuredClone(state);
                      try {
                        refund(check, sale.id, qty, restock, reason);
                        setReview(true);
                        setError("");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }
                  }}
                >
                  {review ? "Konfirmasi refund" : "Tinjau refund"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <Receipt sale={sale} />
              {state.refunds
                .filter((r) => r.sale === sale.id)
                .map((r) => (
                  <p className="info-note" key={r.id}>
                    {r.id} · {money(r.amount)} · {r.reason}
                  </p>
                ))}
              <div className="dialog-actions">
                <button
                  className="button secondary"
                  onClick={() => window.print()}
                >
                  <Printer size={16} /> Cetak struk
                </button>
                <button
                  className="button primary"
                  disabled={label(sale) === "Refund penuh"}
                  onClick={() => {
                    setQty(sale.lines.map(() => 0));
                    setRestock(sale.lines.map(() => 0));
                    setReason("");
                    setManual(false);
                    setReview(false);
                    setRefunding(true);
                  }}
                >
                  <RotateCcw size={16} /> Refund barang
                </button>
              </div>
            </>
          ))}
      </Modal>
    </div>
  );
}
