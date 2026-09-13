"use client";
import { useState } from "react";
import { Plus, TrendingUp, ArrowDownRight } from "lucide-react";
import { useBusiness } from "../business-provider";
import { useWorkspace } from "../workspace-context";
import { Modal } from "../ui";
import { money, periodLabel, type Period, outletName } from "@/lib/demo-data";
import {
  liveSummary,
  liveTopProducts,
  activeShift,
  cashMovement,
  whole,
  uid,
  audit,
  type StoreId,
} from "@/lib/operations";
import {
  PageHeading,
  DemoNote,
  Tabs,
  Field,
  NumericInput,
  ErrorNote,
  Empty,
  Stats,
  StoreSelect,
  ExportButton,
  csvDownload,
} from "./shared";
export function ReportsPage() {
  const { state, commit } = useBusiness();
  const { outlet, period, setPeriod, notify } = useWorkspace();
  const [tab, setTab] = useState("Ringkasan"),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [expense, setExpense] = useState({
      outlet: (outlet === "all"
        ? state.remote?.outlets?.find((o: any) => o.active)?.id || ""
        : outlet) as StoreId,
      category: "Operasional",
      amount: 0,
      method: "Tunai",
      note: "",
    });
  const summary = liveSummary(state, outlet, period),
    top = liveTopProducts(state, outlet, period),
    expenses = state.expenses.filter(
      (e) => outlet === "all" || e.outlet === outlet,
    ),
    balances = state.balances.filter(
      (b) => outlet === "all" || b.outlet === outlet,
    );
  const max = Math.max(...summary.chart.map((x) => x.sales), 1);
  function exportReport() {
    if (tab === "Pengeluaran")
      csvDownload("pengeluaran-.csv", [
        ["ID", "Outlet", "Kategori", "Metode", "Nominal", "Catatan"],
        ...expenses.map((e) => [
          e.id,
          outletName(e.outlet),
          e.category,
          e.method,
          e.amount,
          e.note,
        ]),
      ]);
    else if (tab === "Persediaan")
      csvDownload("nilai-persediaan.csv", [
        ["Produk", "Outlet", "Unit", "Biaya rata-rata", "Nilai"],
        ...balances.map((b) => [
          state.products.find((p) => p.id === b.productId)?.name || "",
          outletName(b.outlet),
          b.stock,
          b.cost,
          b.stock * b.cost,
        ]),
      ]);
    else
      csvDownload("ringkasan-laporan.csv", [
        ["Metrik", periodLabel(period)],
        ["Penjualan bersih", summary.sales],
        ["Refund (tanpa pajak)", summary.refunds],
        ["HPP", summary.sales - summary.grossProfit],
        ["Laba kotor", summary.grossProfit],
        ["Pengeluaran", summary.expenses],
        ["Laba operasional", summary.grossProfit - summary.expenses],
      ]);
  }
  return (
    <div className="ops-page">
      <PageHeading
        eyebrow="ANALISIS USAHA"
        title="Laporan"
        description="Pahami penjualan, biaya, dan pergerakan usaha Anda."
      >
        <select
          aria-label="Periode laporan"
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
        >
          <option value="1">Hari ini</option>
          <option value="7">7 hari terakhir</option>
          <option value="30">30 hari terakhir</option>
        </select>
        <ExportButton onClick={exportReport} />
      </PageHeading>
      <DemoNote />
      <Stats
        items={[
          {
            label: "Penjualan bersih",
            value: money(summary.sales),
            hint: "Setelah diskon dan refund, tanpa pajak",
          },
          {
            label: "Laba kotor",
            value: money(summary.grossProfit),
            hint: "Penjualan bersih dikurangi HPP",
          },
          {
            label: "Pengeluaran",
            value: money(summary.expenses),
            hint: "Biaya operasional tercatat",
          },
          {
            label: "Laba operasional",
            value: money(summary.grossProfit - summary.expenses),
            hint: periodLabel(period),
          },
        ]}
      />
      <Tabs
        items={["Ringkasan", "Pengeluaran", "Persediaan"]}
        value={tab}
        onChange={setTab}
      />
      {tab === "Ringkasan" ? (
        <div className="ops-report-grid">
          <section className="panel ops-section">
            <div className="ops-toolbar">
              <h2>
                <TrendingUp size={18} /> Tren penjualan bersih
              </h2>
              <small>{periodLabel(period)}</small>
            </div>
            <div
              className="ops-bar-chart"
              aria-label="Grafik penjualan per hari"
            >
              {summary.chart.map((x, i) => (
                <div key={i} title={`${x.label}: ${money(x.sales)}`}>
                  <span
                    style={{
                      height: `${Math.max(2, (x.sales / max) * 180)}px`,
                    }}
                  />
                  <small>
                    {summary.chart.length > 7
                      ? i % 5 === 0
                        ? x.label
                        : ""
                      : x.label}
                  </small>
                </div>
              ))}
            </div>
            <p className="ops-caption">
              Data historis ilustratif ditambah aktivitas pada sesi hari ini.
            </p>
          </section>
          <section className="panel ops-section">
            <h2>Ringkasan laba rugi</h2>
            {[
              ["Penjualan sebelum refund", summary.sales + summary.refunds],
              ["Refund penjualan", -summary.refunds],
              ["Penjualan bersih", summary.sales],
              ["Harga pokok penjualan", -(summary.sales - summary.grossProfit)],
              ["Laba kotor", summary.grossProfit],
              ["Pengeluaran operasional", -summary.expenses],
              ["Laba operasional", summary.grossProfit - summary.expenses],
            ].map(([label, value]) => (
              <div className="ops-keyvalue" key={label}>
                <span>{label}</span>
                <b>{money(Number(value))}</b>
              </div>
            ))}
          </section>
          <section className="panel ops-section ops-full">
            <h2>Produk terlaris</h2>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>SKU</th>
                    <th>Unit bersih</th>
                    <th>Pendapatan</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.sku}</td>
                      <td>{p.units}</td>
                      <td>{money(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ops-caption">
              Alokasi produk historis adalah ilustrasi; aktivitas sesi menambah
              angka terkait.
            </p>
          </section>
        </div>
      ) : tab === "Pengeluaran" ? (
        <section className="panel">
          <div className="ops-toolbar">
            <div>
              <h2>Pengeluaran sesi ini</h2>
              <small>
                Agregat historis{" "}
                {money(
                  summary.expenses - expenses.reduce((a, e) => a + e.amount, 0),
                )}{" "}
                termasuk pada ringkasan.
              </small>
            </div>
            <button
              className="button primary"
              onClick={() => {
                setError("");
                setOpen(true);
              }}
            >
              <Plus size={16} /> Catat pengeluaran
            </button>
          </div>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th>Outlet</th>
                  <th>Catatan</th>
                  <th>Metode</th>
                  <th>Nominal</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td>{e.category}</td>
                    <td>{outletName(e.outlet)}</td>
                    <td>{e.note}</td>
                    <td>{e.method}</td>
                    <td>{money(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!expenses.length && (
            <Empty>
              <ArrowDownRight size={30} />
              <h3>Belum ada pengeluaran sesi ini</h3>
              <p>Catat biaya toko untuk memperbarui laba operasional.</p>
            </Empty>
          )}
        </section>
      ) : (
        <section className="panel">
          <div className="ops-toolbar">
            <h2>Nilai persediaan saat ini</h2>
            <strong>
              {money(balances.reduce((a, b) => a + b.stock * b.cost, 0))}
            </strong>
          </div>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Outlet</th>
                  <th>Stok</th>
                  <th>Biaya rata-rata</th>
                  <th>Nilai</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.outlet + b.productId}>
                    <td>
                      {state.products.find((p) => p.id === b.productId)?.name}
                    </td>
                    <td>{outletName(b.outlet)}</td>
                    <td>{b.stock}</td>
                    <td>{money(b.cost)}</td>
                    <td>{money(b.stock * b.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!balances.length && (
            <Empty>Belum ada saldo persediaan pada outlet ini.</Empty>
          )}
        </section>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Catat pengeluaran"
        description="Pengeluaran tunai mengurangi kas shift aktif. Pengeluaran transfer dicatat manual dalam ."
      >
        <form
          className="ops-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await commit((s) => {
              if (!whole(expense.amount, 1) || !expense.note.trim())
                throw new Error("Isi nominal bulat positif dan catatan.");
              if (expense.method === "Tunai") {
                if (!activeShift(s, expense.outlet))
                  throw new Error(
                    "Buka shift outlet ini sebelum mencatat pengeluaran tunai.",
                  );
                cashMovement(
                  s,
                  expense.outlet,
                  -expense.amount,
                  `Pengeluaran: ${expense.note}`,
                );
              }
              s.expenses.unshift({ ...expense, id: uid("EXP") });
              audit(s, `Pengeluaran ${expense.category}: ${expense.amount}`);
            });
            if (!r.ok) setError(r.error);
            else {
              setOpen(false);
              setExpense({ ...expense, amount: 0, note: "" });
              notify("Pengeluaran  dicatat. Laporan diperbarui.");
            }
          }}
        >
          <Field label="Outlet">
            <StoreSelect
              value={expense.outlet}
              onChange={(outlet) => setExpense({ ...expense, outlet })}
            />
          </Field>
          <Field label="Kategori">
            <select
              value={expense.category}
              onChange={(e) =>
                setExpense({ ...expense, category: e.target.value })
              }
            >
              {[
                "Operasional",
                "Transportasi",
                "Listrik & air",
                "Gaji",
                "Sewa",
                "Lainnya",
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Nominal (Rp)">
            <NumericInput
              required
              min="1"
              value={expense.amount}
              onValueChange={(value) =>
                setExpense({ ...expense, amount: value })
              }
            />
          </Field>
          <Field label="Metode">
            <select
              value={expense.method}
              onChange={(e) =>
                setExpense({ ...expense, method: e.target.value })
              }
            >
              <option>Tunai</option>
              <option>Transfer</option>
            </select>
          </Field>
          <Field label="Catatan">
            <textarea
              required
              value={expense.note}
              onChange={(e) => setExpense({ ...expense, note: e.target.value })}
            />
          </Field>
          <ErrorNote error={error} />
          <button className="button primary full">
            Konfirmasi pengeluaran
          </button>
        </form>
      </Modal>
    </div>
  );
}
