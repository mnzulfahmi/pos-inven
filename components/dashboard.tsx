"use client";
import { useBusiness } from "./business-provider";
import {
  liveSummary,
  liveLowStock,
  liveTopProducts,
  balance,
  createPurchase,
  uid,
  audit,
} from "@/lib/operations";
import Link from "next/link";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  Download,
  Info,
  Package,
  ReceiptText,
  ShoppingBasket,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  asOf,
  money,
  number,
  outletName,
  Period,
  periodLabel,
  previousLabel,
} from "@/lib/demo-data";
import { useWorkspace } from "./workspace-context";
import { Modal, ProductIcon } from "./ui";

export function PeriodSelect() {
  const { period, setPeriod } = useWorkspace();
  return (
    <div className="period-select">
      <CalendarDays size={16} />
      <select
        aria-label="Pilih periode"
        value={period}
        onChange={(e) => setPeriod(e.target.value as Period)}
      >
        <option value="7">7 hari terakhir</option>
        <option value="30">30 hari terakhir</option>
        <option value="1">Hari ini</option>
      </select>
      <ChevronDown size={14} />
    </div>
  );
}
function Growth({ value }: { value: number | null }) {
  return (
    <span className={`growth ${value !== null && value < 0 ? "negative" : ""}`}>
      {value === null ? (
        "—"
      ) : (
        <>
          {value < 0 ? (
            <ArrowDownRight size={13} />
          ) : (
            <ArrowUpRight size={13} />
          )}
          {Math.abs(value).toFixed(1).replace(".", ",")}%
        </>
      )}
    </span>
  );
}
export function Dashboard() {
  const { state: business, commit } = useBusiness();
  const getSummary = (
    o: import("@/lib/demo-data").OutletId,
    p: import("@/lib/demo-data").Period,
  ) => liveSummary(business, o, p);
  const getLowStock = (o: import("@/lib/demo-data").OutletId) =>
    liveLowStock(business, o);
  const getTopProducts = (
    o: import("@/lib/demo-data").OutletId,
    p: import("@/lib/demo-data").Period,
  ) => liveTopProducts(business, o, p);
  const { outlet, period, notify } = useWorkspace();
  const [metric, setMetric] = useState<"sales" | "count">("sales");
  const [modal, setModal] = useState<
    "stock" | "products" | "definitions" | null
  >(null);
  const summary = getSummary(outlet, period);
  const low = getLowStock(outlet);
  const top = getTopProducts(outlet, period);
  const empty = summary.count === 0;
  const exportData = () => {
    const rows = [
      [
        "Tanggal",
        "Outlet",
        "Penjualan bersih (IDR)",
        "Transaksi",
        "Refund (IDR)",
      ],
      ...summary.chart.map((row) => [
        row.date,
        outletName(outlet),
        row.sales,
        row.count,
        row.refunds,
      ]),
    ];
    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.join(",")).join("\n")],
      { type: "text/csv;charset=utf-8;" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nusa-penjualan-${outlet}-${period}-hari.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Laporan  berhasil diekspor.");
  };
  const stats = [
    {
      title: "Total penjualan",
      value: money(summary.sales),
      growth: summary.salesGrowth,
      icon: Wallet,
      color: "orange",
      foot: "Penjualan bersih, sebelum pajak",
    },
    {
      title: "Total transaksi",
      value: number(summary.count),
      growth: summary.countGrowth,
      icon: ReceiptText,
      color: "blue",
      foot: "Transaksi penjualan berhasil",
    },
    {
      title: "Rata-rata belanja",
      value: money(summary.basket),
      growth: summary.basketGrowth,
      icon: ShoppingBasket,
      color: "purple",
      foot: "Per transaksi, sebelum refund",
    },
  ];
  return (
    <div className="dashboard page-enter">
      <div className="page-heading">
        <div>
          <div className="greeting">Jumat, 11 September 2026</div>
          <h1>
            Ringkasan bisnis<span className="heading-dot">.</span>
          </h1>
          <p>Semua yang perlu Anda tahu tentang usaha hari ini.</p>
        </div>
        <div className="heading-actions">
          <PeriodSelect />
          <button
            className="button secondary export-button"
            onClick={exportData}
            disabled={empty}
          >
            <Download size={16} />
            <span>Ekspor laporan</span>
          </button>
        </div>
      </div>
      <div className="welcome-strip">
        <span className="welcome-spark">
          <Sparkles size={20} />
        </span>
        <div>
          <strong>Selamat datang kembali, Andi!</strong>
          <span>
            {empty
              ? "Outlet baru, peluang baru. Ringkasan akan muncul setelah transaksi pertama."
              : "Usaha Anda terus bergerak. Yuk, lihat perkembangannya."}
          </span>
        </div>
        <span className="welcome-label">
          <span /> Data
        </span>
      </div>
      <section className="stats-grid" aria-label="Metrik bisnis">
        {stats.map(({ title, value, growth, icon: Icon, color, foot }) => (
          <article className="stat-card" key={title}>
            <div className="stat-top">
              <span>{title}</span>
              <span className={`stat-icon ${color}`}>
                <Icon size={19} />
              </span>
            </div>
            <div className="stat-value">{value}</div>
            <div className="stat-comparison">
              <Growth value={growth} />
              <span>vs periode sebelumnya</span>
            </div>
            <div className="stat-foot">{foot}</div>
          </article>
        ))}
        <article className="stat-card stock-stat">
          <div className="stat-top">
            <span>Stok menipis</span>
            <span className="stat-icon amber">
              <Package size={19} />
            </span>
          </div>
          <div className="stat-value">
            {low.length}
            <span>produk / outlet</span>
          </div>
          <div className="stat-comparison">
            <span
              className={`stock-count-label ${!low.length ? "healthy" : ""}`}
            >
              {low.length ? "Perlu perhatian" : "Tidak ada stok rendah"}
            </span>
          </div>
          <button
            className="stat-foot stock-action"
            onClick={() => setModal("stock")}
          >
            Lihat detail stok <ArrowRight size={14} />
          </button>
        </article>
      </section>
      <div className="dashboard-middle">
        <section className="panel sales-panel">
          <div className="panel-heading">
            <div>
              <h2>Ikhtisar penjualan</h2>
              <p>Perkembangan usaha dari hari ke hari</p>
            </div>
            <button
              className="icon-button subtle"
              aria-label="Definisi metrik penjualan"
              onClick={() => setModal("definitions")}
            >
              <CircleHelp size={17} />
            </button>
          </div>
          <div className="chart-toolbar">
            <div className="segmented" role="group" aria-label="Metrik grafik">
              <button
                className={metric === "sales" ? "selected" : ""}
                aria-pressed={metric === "sales"}
                onClick={() => setMetric("sales")}
              >
                Penjualan
              </button>
              <button
                className={metric === "count" ? "selected" : ""}
                aria-pressed={metric === "count"}
                onClick={() => setMetric("count")}
              >
                Transaksi
              </button>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-current" />
                Periode ini
              </span>
              <span>
                <i />
                Sebelumnya
              </span>
            </div>
          </div>
          {empty ? (
            <div className="empty-chart">
              <ChartNoAxesCombined size={34} />
              <h3>Perjalanan usaha dimulai di sini</h3>
              <p>
                Belum ada transaksi di Outlet Buah Batu.
                <br />
                Pilih outlet lain untuk menjelajahi data .
              </p>
            </div>
          ) : (
            <div
              className="sales-chart"
              role="img"
              aria-label={`Grafik ${metric === "sales" ? "penjualan bersih" : "transaksi"}, ${periodLabel(period)}. Total ${metric === "sales" ? money(summary.sales) : summary.count}.`}
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart
                  data={summary.chart}
                  margin={{ top: 14, right: 12, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="salesGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#ed682f"
                        stopOpacity={0.19}
                      />
                      <stop
                        offset="100%"
                        stopColor="#ed682f"
                        stopOpacity={0.005}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 4"
                    vertical={false}
                    stroke="#eceef0"
                  />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "#92949c" }}
                    minTickGap={28}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "#92949c" }}
                    tickFormatter={(value) =>
                      metric === "sales"
                        ? `${value / 1000000} jt`
                        : number(value)
                    }
                    width={64}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #eeeeef",
                      fontSize: 12,
                      boxShadow: "0 4px 20px #00000008",
                    }}
                    formatter={(value, name) => [
                      metric === "sales"
                        ? money(Number(value))
                        : `${number(Number(value))} transaksi`,
                      name === "previous" || name === "previousCount"
                        ? "Periode sebelumnya"
                        : "Periode ini",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey={metric === "sales" ? "previous" : "previousCount"}
                    stroke="#cbd0d5"
                    fill="transparent"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey={metric}
                    stroke="#ec682f"
                    fill="url(#salesGradient)"
                    strokeWidth={2.6}
                    activeDot={{ r: 5, stroke: "white", strokeWidth: 3 }}
                    dot={summary.chart.length === 1 ? { r: 5 } : false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="chart-bottom">
            <span>
              <span className="legend-dot" />
              {outletName(outlet)}
            </span>
            <span>{periodLabel(period)}</span>
          </div>
        </section>
        <section className="insight-panel">
          <div className="insight-eyebrow">
            <span>
              <Sparkles size={16} /> INSIGHT NUSA AI
            </span>
            <span className="tiny-badge">UNTUK ANDA</span>
          </div>
          <h2>
            {empty ? (
              <>
                Setiap usaha besar
                <br />
                punya langkah pertama.
              </>
            ) : (
              <>
                Angka bercerita.
                <br />
                <span>Saatnya melangkah.</span>
              </>
            )}
          </h2>
          <p className="insight-intro">
            {empty
              ? "Mulai catat transaksi untuk melihat insight bisnis Anda."
              : "Sedikit insight untuk keputusan yang lebih baik hari ini."}
          </p>
          <div className="insight-items">
            <div>
              <span className="insight-item-icon">
                <TrendingUp size={18} />
              </span>
              <p>
                <strong>
                  {empty
                    ? "Siap memantau penjualan"
                    : `Penjualan ${summary.salesGrowth !== null && summary.salesGrowth < 0 ? "turun" : "naik"} ${Math.abs(
                        summary.salesGrowth ?? 0,
                      )
                        .toFixed(1)
                        .replace(".", ",")}%`}
                </strong>
                <span>
                  {empty
                    ? "Ringkasan muncul setelah transaksi pertama."
                    : `Dibandingkan ${previousLabel(period)}. Lihat kontribusi produk Anda.`}
                </span>
              </p>
            </div>
            <div>
              <span className="insight-item-icon">
                <Package size={18} />
              </span>
              <p>
                <strong>
                  {low.length
                    ? `${low.length} stok perlu diisi kembali`
                    : "Persediaan terpantau"}
                </strong>
                <span>
                  {low.length
                    ? "Siapkan pembelian agar pelanggan tetap kebagian."
                    : "Belum ada produk di bawah batas minimum."}
                </span>
              </p>
            </div>
          </div>
          <Link href="/ai?prompt=summary" className="button primary">
            Bahas dengan Nusa AI <ArrowUpRight size={17} />
          </Link>
          <div className="insight-foot">
            <Sparkles size={12} /> Berbasis data usaha Anda
          </div>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel products-panel">
          <div className="panel-heading">
            <div>
              <h2>Produk terlaris</h2>
              <p>Favorit pelanggan pada periode ini</p>
            </div>
            <button
              className="text-button"
              onClick={() => setModal("products")}
            >
              Lihat semua <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Terjual</th>
                  <th>Penjualan</th>
                </tr>
              </thead>
              <tbody>
                {!empty &&
                  top.slice(0, 4).map((product, i) => (
                    <tr key={product.id}>
                      <td>
                        <span className="product-cell">
                          <span className="product-rank">{i + 1}</span>
                          <ProductIcon
                            icon={product.icon}
                            color={product.color}
                            image={product.image}
                            name={product.name}
                          />
                          <span>
                            <strong>{product.name}</strong>
                            <small>{product.variant}</small>
                          </span>
                        </span>
                      </td>
                      <td>
                        {number(product.units)}{" "}
                        <span className="unit-text">unit</span>
                      </td>
                      <td>{money(product.revenue)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {empty && (
              <div className="table-empty">
                Belum ada produk terjual pada periode ini.
              </div>
            )}
          </div>
        </section>
        <section className="panel stock-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Perlu restock <span className="count-badge">{low.length}</span>
              </h2>
              <p>Jaga stok, jaga kepuasan pelanggan</p>
            </div>
            <button
              className="text-button"
              aria-label="Lihat semua stok rendah"
              onClick={() => setModal("stock")}
            >
              <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="stock-list">
            {low.slice(0, 3).map((item) => (
              <div
                className="stock-row"
                key={`${item.productId}-${item.outlet}`}
              >
                <ProductIcon
                  icon={item.product.icon}
                  color={item.product.color}
                  image={item.product.image}
                  name={item.product.name}
                />
                <div className="stock-product">
                  <strong>{item.product.name}</strong>
                  <span>
                    {outletName(item.outlet)} · Min. {item.minimum} unit
                  </span>
                </div>
                <div className="stock-remaining">
                  <strong>
                    {item.stock} <span>unit</span>
                  </strong>
                  <span className="stock-mini-track">
                    <i
                      style={{
                        width: `${Math.min(100, (item.stock / item.minimum) * 100)}%`,
                      }}
                    />
                  </span>
                </div>
              </div>
            ))}
            {!low.length && (
              <div className="table-empty">
                Tidak ada produk yang perlu direstock.
              </div>
            )}
          </div>
          <Link className="restock-link" href="/ai?prompt=restock">
            <Sparkles size={15} /> Buat rencana restock dengan AI{" "}
            <ArrowRight size={15} />
          </Link>
        </section>
      </div>
      <footer className="page-footer">
        <span>
          <Info size={13} />{" "}
          {business.remote?.tenant ? "Data usaha" : "Data contoh"} · Diperbarui{" "}
          {asOf}
        </span>
        <span>
          Dibuat untuk usaha yang terus tumbuh{" "}
          <span className="footer-flower">✳</span>
        </span>
      </footer>
      <Modal
        title="Produk terlaris"
        description={`${outletName(outlet)} · ${periodLabel(period)} · ${business.remote?.tenant ? "Data usaha" : "Data demo"}`}
        open={modal === "products"}
        onOpenChange={() => setModal(null)}
        wide
      >
        <div className="table-scroll">
          <table className="products-table">
            <thead>
              <tr>
                <th>Produk</th>
                <th>Terjual</th>
                <th>Penjualan</th>
              </tr>
            </thead>
            <tbody>
              {top
                .filter((p) => p.units > 0)
                .map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="product-cell">
                        <ProductIcon
                          icon={p.icon}
                          color={p.color}
                          image={p.image}
                          name={p.name}
                        />
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.variant}</small>
                        </span>
                      </span>
                    </td>
                    <td>{number(p.units)} unit</td>
                    <td>{money(p.revenue)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {empty && (
            <p className="table-empty">Belum ada penjualan pada periode ini.</p>
          )}
        </div>
        <div className="info-note">
          Peringkat berdasarkan nilai penjualan produk. Daftar ini menampilkan
          hingga 5 produk teratas; produk lainnya tetap termasuk dalam total
          penjualan.
        </div>
      </Modal>
      <Modal
        title="Stok yang perlu perhatian"
        description={`${outletName(outlet)} · Snapshot ${asOf}`}
        open={modal === "stock"}
        onOpenChange={() => setModal(null)}
        wide
      >
        <div className="table-scroll">
          <table className="products-table">
            <thead>
              <tr>
                <th>Produk / outlet</th>
                <th>Stok</th>
                <th>Minimum</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {low.map((item) => (
                <tr key={`${item.productId}-${item.outlet}`}>
                  <td>
                    <strong>{item.product.name}</strong>
                    <small className="table-small">
                      {outletName(item.outlet)}
                    </small>
                  </td>
                  <td>{item.stock}</td>
                  <td>{item.minimum}</td>
                  <td>
                    <span
                      className={`status-badge ${item.stock === 0 ? "danger" : ""}`}
                    >
                      {item.stock === 0 ? "Habis" : "Menipis"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!low.length && (
            <p className="table-empty">
              Semua stok berada di atas batas minimum, atau belum ada produk di
              outlet ini.
            </p>
          )}
        </div>
        {low.length > 0 && (
          <Link href="/ai?prompt=restock" className="button primary full">
            Tinjau rekomendasi restock <Sparkles size={16} />
          </Link>
        )}
      </Modal>
      <Modal
        title="Memahami angka bisnis"
        description="Definisi metrik mengikuti PRD Nusa."
        open={modal === "definitions"}
        onOpenChange={() => setModal(null)}
      >
        <div className="definition-list">
          <p>
            <strong>Total penjualan</strong>Penjualan kotor dikurangi diskon dan
            refund barang, sebelum pajak.
          </p>
          <p>
            <strong>Total transaksi</strong>Jumlah transaksi penjualan yang
            berhasil pada periode terpilih.
          </p>
          <p>
            <strong>Rata-rata belanja</strong>Nilai penjualan setelah diskon dan
            sebelum pajak, sebelum pengurang refund, dibagi jumlah transaksi.
          </p>
          <p>
            <strong>Periode pembanding</strong>
            {previousLabel(period)}. Perubahan tidak dihitung jika nilai periode
            sebelumnya nol.
          </p>
          <p>
            <strong>Stok menipis</strong>Jumlah pasangan produk dan outlet
            dengan stok di bawah atau sama dengan minimum. Angka stok adalah
            snapshot terkini.
          </p>
        </div>
      </Modal>
    </div>
  );
}
