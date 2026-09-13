"use client";
import { useState } from "react";
import {
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  Banknote,
  Printer,
  CheckCircle2,
} from "lucide-react";
import { useBusiness } from "../business-provider";
import { useWorkspace } from "../workspace-context";
import { Modal, ProductIcon } from "../ui";
import { money, outletName } from "@/lib/demo-data";
import {
  activeShift,
  balance,
  checkout,
  openShift,
  closeShift,
  cashMovement,
  type StoreId,
} from "@/lib/operations";
import {
  PageHeading,
  DemoNote,
  SearchBox,
  Tabs,
  Field,
  NumericInput,
  ErrorNote,
  Badge,
  Empty,
  NeedOutlet,
  Receipt,
  FlowLink,
} from "./shared";
export function PosPage() {
  const { state, commit } = useBusiness();
  const { outlet, notify } = useWorkspace();
  const store = outlet as StoreId;
  const [cart, setCart] = useState<{ productId: string; quantity: number }[]>(
      [],
    ),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("Semua"),
    [discount, setDiscount] = useState(0),
    [customer, setCustomer] = useState(""),
    [method, setMethod] = useState("Tunai"),
    [cash, setCash] = useState(0),
    [confirmed, setConfirmed] = useState(false),
    [dialog, setDialog] = useState(""),
    [error, setError] = useState(""),
    [amount, setAmount] = useState(0),
    [reason, setReason] = useState(""),
    [direction, setDirection] = useState("Masuk"),
    [receiptId, setReceiptId] = useState(""),
    [paper, setPaper] = useState("80");
  const shift = activeShift(state, store);
  const subtotal = cart.reduce(
    (a, l) =>
      a +
      (state.products.find((p) => p.id === l.productId)?.price || 0) *
        l.quantity,
    0,
  );
  const net = Math.max(0, subtotal - discount);
  const tax = Math.round((net * state.settings.tax) / 100),
    total = net + tax;
  const filtered = state.products.filter(
    (p) =>
      !p.archived &&
      (category === "Semua" || p.category === category) &&
      `${p.name} ${p.variant} ${p.sku} ${p.barcode}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function add(id: string) {
    const b = balance(state, store, id),
      q = cart.find((l) => l.productId === id)?.quantity || 0;
    if (q >= b.stock) {
      notify("Stok tidak mencukupi.");
      return;
    }
    setCart((old) =>
      old.some((l) => l.productId === id)
        ? old.map((l) =>
            l.productId === id ? { ...l, quantity: l.quantity + 1 } : l,
          )
        : [...old, { productId: id, quantity: 1 }],
    );
  }
  function show(value: string) {
    setError("");
    setReason("");
    setAmount(0);
    setConfirmed(false);
    setDialog(value);
  }
  async function pay() {
    const result = await commit((s) =>
      checkout(
        s,
        store,
        cart,
        discount,
        s.settings.tax,
        method,
        method === "Tunai" ? cash : total,
        customer,
      ),
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReceiptId(result.value);
    setCart([]);
    setDiscount(0);
    setDialog("receipt");
    notify("Penjualan  tersimpan. Stok dan laporan diperbarui.");
  }
  async function manageShift() {
    const result = await commit((s) =>
      dialog === "open"
        ? openShift(s, store, amount)
        : dialog === "close"
          ? closeShift(s, store, amount, reason)
          : cashMovement(
              s,
              store,
              (direction === "Masuk" ? 1 : -1) * amount,
              reason,
            ),
    );
    if (!result.ok) setError(result.error);
    else {
      setDialog("");
      notify("Kas shift  diperbarui.");
    }
  }
  const sale = state.sales.find((s) => s.id === receiptId);
  return (
    <div className="ops-page">
      <PageHeading
        eyebrow="PENJUALAN"
        title="Kasir"
        description="Layani pelanggan, selesaikan transaksi, lanjutkan hari Anda."
      >
        <FlowLink href="/transactions">Riwayat transaksi</FlowLink>
      </PageHeading>
      <DemoNote />
      {outlet === "all" ? (
        <NeedOutlet />
      ) : (
        <>
          <div className="ops-shiftbar">
            <span>
              <i className={shift ? "dot-live" : "dot-off"} />
              <strong>
                {shift ? "Shift aktif" : "Shift belum dibuka"}
              </strong> · {outletName(outlet)}{" "}
              {shift && <small>Kas diharapkan {money(shift.expected)}</small>}
            </span>
            <div>
              {shift ? (
                <>
                  <button
                    className="button secondary compact"
                    onClick={() => show("cash")}
                  >
                    Kas masuk / keluar
                  </button>
                  <button
                    className="button secondary compact"
                    onClick={() => show("close")}
                  >
                    Tutup shift
                  </button>
                </>
              ) : (
                <button
                  className="button primary compact"
                  onClick={() => show("open")}
                >
                  <Banknote size={16} /> Buka shift
                </button>
              )}
            </div>
          </div>
          <div className="ops-pos">
            <section className="panel ops-catalog">
              <div className="ops-toolbar">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const exact = filtered.find(
                      (p) =>
                        p.barcode === search ||
                        p.sku.toLowerCase() === search.toLowerCase(),
                    );
                    if (exact) {
                      add(exact.id);
                      setSearch("");
                    } else
                      notify(
                        "Masukkan barcode atau SKU lengkap untuk pemindaian.",
                      );
                  }}
                >
                  <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder="Cari produk, SKU, atau pindai barcode…"
                  />
                </form>
                <Badge>{filtered.length} produk</Badge>
              </div>
              <Tabs
                items={[
                  "Semua",
                  ...new Set(
                    state.products
                      .filter((p) => !p.archived)
                      .map((p) => p.category),
                  ),
                ]}
                value={category}
                onChange={setCategory}
              />
              <div className="ops-product-grid">
                {filtered.map((p) => {
                  const stock = balance(state, store, p.id).stock;
                  return (
                    <button
                      className="ops-product-card"
                      key={p.id}
                      disabled={!stock}
                      onClick={() => add(p.id)}
                    >
                      <div className="ops-product-art">
                        <ProductIcon
                          icon={p.icon}
                          color={p.color}
                          image={p.image}
                          name={p.name}
                        />
                        <span className={!stock ? "stock-zero" : ""}>
                          {stock ? `${stock} tersedia` : "Stok habis"}
                        </span>
                      </div>
                      <strong>{p.name}</strong>
                      <small>{p.variant}</small>
                      <div>
                        <b>{money(p.price)}</b>
                        <Plus size={18} />
                      </div>
                    </button>
                  );
                })}
              </div>
              {!filtered.length && (
                <Empty>Produk tidak ditemukan. Coba kata kunci lain.</Empty>
              )}
            </section>
            <aside className="panel ops-cart">
              <div className="ops-toolbar">
                <h2>
                  <ShoppingCart size={19} /> Keranjang
                </h2>
                <Badge>{cart.reduce((a, l) => a + l.quantity, 0)} item</Badge>
              </div>
              <Field label="Pelanggan">
                <select
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                >
                  <option value="">Pelanggan umum</option>
                  {state.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="ops-cart-lines">
                {!cart.length ? (
                  <Empty>
                    <ShoppingCart size={32} />
                    <h3>Siap menerima pesanan</h3>
                    <p>Pilih produk di sebelah kiri untuk memulai.</p>
                  </Empty>
                ) : (
                  cart.map((l) => {
                    const p = state.products.find((p) => p.id === l.productId)!;
                    return (
                      <div className="ops-cart-line" key={p.id}>
                        <ProductIcon
                          icon={p.icon}
                          color={p.color}
                          image={p.image}
                          name={p.name}
                        />
                        <div>
                          <strong>{p.name}</strong>
                          <small>{money(p.price)}</small>
                          <div className="ops-stepper">
                            <button
                              aria-label={`Kurangi ${p.name}`}
                              onClick={() =>
                                setCart((old) =>
                                  old
                                    .map((x) =>
                                      x.productId === p.id
                                        ? { ...x, quantity: x.quantity - 1 }
                                        : x,
                                    )
                                    .filter((x) => x.quantity > 0),
                                )
                              }
                            >
                              <Minus size={13} />
                            </button>
                            <span>{l.quantity}</span>
                            <button
                              aria-label={`Tambah ${p.name}`}
                              onClick={() => add(p.id)}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>
                        <div>
                          <b>{money(p.price * l.quantity)}</b>
                          <button
                            className="icon-button"
                            aria-label={`Hapus ${p.name}`}
                            onClick={() =>
                              setCart(cart.filter((x) => x.productId !== p.id))
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="ops-totals">
                <div>
                  <span>Subtotal</span>
                  <b>{money(subtotal)}</b>
                </div>
                <Field label="Diskon (Rp)">
                  <NumericInput
                    min="0"
                    max={subtotal}
                    value={discount}
                    onValueChange={setDiscount}
                  />
                </Field>
                {state.settings.discount > 0 && (
                  <button
                    className="text-button"
                    onClick={() =>
                      setDiscount(
                        Math.round((subtotal * state.settings.discount) / 100),
                      )
                    }
                  >
                    Terapkan diskon {state.settings.discount}%
                  </button>
                )}
                <div>
                  <span>Pajak ({state.settings.tax}%)</span>
                  <b>{money(tax)}</b>
                </div>
                <div className="grand-total">
                  <span>Total</span>
                  <strong>{money(total)}</strong>
                </div>
              </div>
              <button
                className="button primary full"
                disabled={!cart.length || !shift || discount > subtotal}
                onClick={() => {
                  show("payment");
                  setCash(total);
                }}
              >
                Lanjut pembayaran <span>{money(total)}</span>
              </button>
              {!shift && (
                <p className="ops-caption">
                  Buka shift untuk mengaktifkan pembayaran.
                </p>
              )}
            </aside>
          </div>
          <section className="panel ops-section">
            <h2>Riwayat shift sesi ini</h2>
            {!state.shifts.filter((s) => s.outlet === store).length ? (
              <p>Belum ada shift. Mulai dengan mencatat modal kas awal.</p>
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Shift</th>
                      <th>Modal awal</th>
                      <th>Kas diharapkan</th>
                      <th>Kas fisik</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.shifts
                      .filter((s) => s.outlet === store)
                      .map((s) => (
                        <tr key={s.id}>
                          <td>{s.id}</td>
                          <td>{money(s.opening)}</td>
                          <td>{money(s.expected)}</td>
                          <td>
                            {s.counted === undefined ? "—" : money(s.counted)}
                          </td>
                          <td>
                            <Badge>{s.closed ? "Ditutup" : "Aktif"}</Badge>
                            {s.reason && <small>{s.reason}</small>}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      <Modal
        open={["open", "close", "cash"].includes(dialog)}
        onOpenChange={() => setDialog("")}
        title={
          dialog === "open"
            ? "Buka shift baru"
            : dialog === "close"
              ? "Rekonsiliasi & tutup shift"
              : "Catat pergerakan kas"
        }
        description="Pencatatan lokal untuk simulasi kasir. Tinjau nominal sebelum konfirmasi."
      >
        <div className="ops-form">
          {dialog === "close" && (
            <div className="ops-review">
              <span>Kas diharapkan</span>
              <strong>{money(shift?.expected || 0)}</strong>
            </div>
          )}
          {dialog === "cash" && (
            <Field label="Jenis pergerakan">
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                <option>Masuk</option>
                <option>Keluar</option>
              </select>
            </Field>
          )}
          <Field
            label={
              dialog === "open"
                ? "Modal awal (Rp)"
                : dialog === "close"
                  ? "Kas fisik terhitung (Rp)"
                  : "Nominal (Rp)"
            }
          >
            <NumericInput min="0" value={amount} onValueChange={setAmount} />
          </Field>
          {dialog !== "open" && (
            <Field
              label={
                dialog === "close"
                  ? "Alasan selisih (wajib jika berbeda)"
                  : "Alasan (wajib)"
              }
            >
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          {dialog === "close" && (
            <p>
              Selisih: <b>{money(amount - (shift?.expected || 0))}</b>
            </p>
          )}
          <ErrorNote error={error} />
          <button className="button primary full" onClick={manageShift}>
            Konfirmasi{" "}
            {dialog === "open"
              ? "buka shift"
              : dialog === "close"
                ? "tutup shift"
                : "pencatatan"}
          </button>
        </div>
      </Modal>
      <Modal
        open={dialog === "payment"}
        onOpenChange={() => setDialog("")}
        title="Tinjau pembayaran"
        description="Transaksi  mengurangi stok dan mencatat penjualan. Tidak ada pembayaran yang diproses."
      >
        <div className="ops-form">
          <div className="ops-review">
            <span>
              {cart.reduce((a, l) => a + l.quantity, 0)} item ·{" "}
              {outletName(outlet)}
            </span>
            <strong>{money(total)}</strong>
          </div>
          {cart.map((l) => (
            <div className="ops-keyvalue" key={l.productId}>
              <span>
                {state.products.find((p) => p.id === l.productId)?.name} ×{" "}
                {l.quantity}
              </span>
              <small>
                Stok {balance(state, store, l.productId).stock} →{" "}
                {balance(state, store, l.productId).stock - l.quantity}
              </small>
            </div>
          ))}
          <Field label="Metode pembayaran">
            <select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                setConfirmed(false);
              }}
            >
              {["Tunai", "QRIS", "Kartu", "Transfer"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          {method === "Tunai" ? (
            <>
              <Field label="Uang diterima (Rp)">
                <NumericInput
                  min={total}
                  value={cash}
                  onValueChange={setCash}
                />
              </Field>
              <p>
                Kembalian: <b>{money(Math.max(0, cash - total))}</b>
              </p>
            </>
          ) : (
            <label className="ops-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              Saya mengonfirmasi pembayaran {method} secara manual dalam
              simulasi.
            </label>
          )}
          <ErrorNote error={error} />
          <button
            className="button primary full"
            disabled={method === "Tunai" ? cash < total : !confirmed}
            onClick={pay}
          >
            <CheckCircle2 size={17} /> Konfirmasi & simpan transaksi
          </button>
        </div>
      </Modal>
      <Modal
        open={dialog === "receipt" && !!sale}
        onOpenChange={() => setDialog("")}
        title="Transaksi berhasil"
        description="Penjualan tersimpan di sesi . Anda dapat mencetak struk atau melihat riwayat."
      >
        {sale && (
          <>
            <Receipt sale={sale} />
            <div className="dialog-actions">
              <select
                aria-label="Ukuran kertas struk"
                value={paper}
                onChange={(e) => setPaper(e.target.value)}
              >
                <option value="80">80 mm</option>
                <option value="58">58 mm</option>
              </select>
              <button
                className="button secondary"
                onClick={() => {
                  document.documentElement.style.setProperty(
                    "--receipt-width",
                    paper + "mm",
                  );
                  window.print();
                }}
              >
                <Printer size={16} /> Cetak
              </button>
              <button className="button primary" onClick={() => setDialog("")}>
                Transaksi baru
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
