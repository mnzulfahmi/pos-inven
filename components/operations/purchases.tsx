"use client";
import { useState } from "react";
import { Plus, Truck, Trash2, PackageCheck } from "lucide-react";
import { useBusiness } from "../business-provider";
import { useWorkspace } from "../workspace-context";
import { Modal } from "../ui";
import { money, outletName } from "@/lib/demo-data";
import {
  createPurchase,
  receivePurchase,
  balance,
  uid,
  audit,
  type StoreId,
} from "@/lib/operations";
import {
  PageHeading,
  DemoNote,
  SearchBox,
  Tabs,
  Field,
  NumericInput,
  Badge,
  ErrorNote,
  Empty,
  Stats,
  StoreSelect,
  ExportButton,
  csvDownload,
} from "./shared";
export function PurchasesPage() {
  const { state, commit } = useBusiness();
  const { outlet, notify } = useWorkspace();
  const [tab, setTab] = useState("Pesanan pembelian"),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("Semua"),
    [dialog, setDialog] = useState(""),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(""),
    [store, setStore] = useState<StoreId>(
      outlet === "all"
        ? state.remote?.outlets?.find((o: any) => o.active)?.id || "all"
        : outlet,
    ),
    [supplier, setSupplier] = useState(""),
    [lines, setLines] = useState<
      { productId: string; quantity: number; cost: number }[]
    >([]),
    [receipts, setReceipts] = useState<{ quantity: number; cost: number }[]>(
      [],
    ),
    [review, setReview] = useState(false),
    [supplierForm, setSupplierForm] = useState({
      id: "",
      name: "",
      phone: "",
      address: "",
    }),
    [cancelReason, setCancelReason] = useState("");
  const po = state.purchases.find((p) => p.id === selected);
  const orders = state.purchases.filter(
    (p) =>
      (outlet === "all" || p.outlet === outlet) &&
      (status === "Semua" || p.status === status) &&
      `${p.id} ${state.suppliers.find((s) => s.id === p.supplier)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const suppliers = state.suppliers.filter((s) =>
    `${s.name} ${s.phone}`.toLowerCase().includes(search.toLowerCase()),
  );
  function show(d: string) {
    setDialog(d);
    setError("");
    setReview(false);
  }
  function openCreate() {
    const firstOutlet =
      (outlet !== "all" &&
        state.remote?.outlets?.some(
          (candidate: any) => candidate.id === outlet && candidate.active,
        ) &&
        outlet) ||
      state.remote?.outlets?.find((candidate: any) => candidate.active)?.id ||
      state.balances[0]?.outlet ||
      "all";
    const firstSupplier = state.suppliers[0]?.id || "";
    const firstProduct = state.products.find((product) => !product.archived);
    setStore(firstOutlet as StoreId);
    setSupplier(firstSupplier);
    setLines(
      firstProduct
        ? [
            {
              productId: firstProduct.id,
              quantity: 1,
              cost: firstProduct.cost,
            },
          ]
        : [],
    );
    show("create");
    if (firstOutlet === "all") setError("Tambahkan outlet terlebih dahulu.");
    else if (!firstSupplier) setError("Tambahkan pemasok terlebih dahulu.");
    else if (!firstProduct) setError("Tambahkan produk terlebih dahulu.");
  }
  async function create() {
    if (
      store === "all" ||
      !state.suppliers.some((item) => item.id === supplier) ||
      !lines.length ||
      lines.some(
        (line) =>
          !state.products.some(
            (product) => product.id === line.productId && !product.archived,
          ),
      )
    ) {
      setError(
        "Pilihan outlet, pemasok, atau produk sudah berubah. Pilih kembali.",
      );
      return;
    }
    const r = await commit((s) => createPurchase(s, store, supplier, lines));
    if (!r.ok) setError(r.error);
    else {
      setDialog("");
      notify("Draft PO dibuat. Tinjau dan setujui sebelum penerimaan.");
    }
  }
  async function receive() {
    if (!po) return;
    const r = await commit((s) => receivePurchase(s, po.id, receipts));
    if (!r.ok) setError(r.error);
    else {
      setDialog("detail");
      notify("Penerimaan dicatat. Stok dan biaya rata-rata diperbarui.");
    }
  }
  return (
    <div className="ops-page">
      <PageHeading
        eyebrow="PERSEDIAAN"
        title="Pembelian"
        description="Dari rencana restock sampai barang tiba, semua dalam satu alur."
      >
        <button
          className="button secondary"
          onClick={() => {
            setSupplierForm({
              id: uid("SUP"),
              name: "",
              phone: "",
              address: "",
            });
            show("supplier");
          }}
        >
          Tambah pemasok
        </button>
        <button className="button primary" onClick={openCreate}>
          <Plus size={17} /> Buat pesanan
        </button>
      </PageHeading>
      <DemoNote />
      <Stats
        items={[
          {
            label: "Pesanan terbuka",
            value: orders.filter(
              (p) => !["Selesai", "Dibatalkan"].includes(p.status),
            ).length,
            hint: "Draft, disetujui, dan diterima sebagian",
          },
          {
            label: "Nilai pesanan terbuka",
            value: money(
              orders
                .filter((p) => !["Selesai", "Dibatalkan"].includes(p.status))
                .reduce(
                  (a, p) =>
                    a +
                    p.lines.reduce(
                      (b, l) => b + (l.quantity - l.received) * l.cost,
                      0,
                    ),
                  0,
                ),
            ),
            hint: "Berdasarkan kuantitas yang belum diterima",
          },
          {
            label: "Pemasok terdaftar",
            value: state.suppliers.length,
            hint: "Mitra pengadaan usaha Anda",
          },
        ]}
      />
      <Tabs
        items={["Pesanan pembelian", "Pemasok"]}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setSearch("");
        }}
      />
      <section className="panel">
        <div className="ops-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder={
              tab === "Pemasok"
                ? "Cari pemasok…"
                : "Cari nomor PO atau pemasok…"
            }
          />
          {tab !== "Pemasok" && (
            <select
              aria-label="Status pesanan"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {[
                "Semua",
                "Draft",
                "Disetujui",
                "Diterima sebagian",
                "Selesai",
                "Dibatalkan",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          )}
        </div>
        <div className="ops-table-wrap">
          {tab === "Pemasok" ? (
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Pemasok</th>
                  <th>Telepon</th>
                  <th>Alamat</th>
                  <th>Pesanan</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="ops-product-cell">
                        <span className="ops-mini-icon">
                          <Truck size={20} />
                        </span>
                        <strong>{s.name}</strong>
                      </div>
                    </td>
                    <td>{s.phone || "—"}</td>
                    <td>{s.address || "—"}</td>
                    <td>
                      {
                        state.purchases.filter((p) => p.supplier === s.id)
                          .length
                      }
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSupplierForm({ ...s });
                          show("supplier");
                        }}
                      >
                        Edit pemasok
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Nomor PO</th>
                  <th>Pemasok</th>
                  <th>Outlet</th>
                  <th>Barang diterima</th>
                  <th>Nilai pesanan</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.id}</strong>
                      <small>11 Sep 2026</small>
                    </td>
                    <td>
                      {state.suppliers.find((s) => s.id === p.supplier)?.name}
                    </td>
                    <td>{outletName(p.outlet)}</td>
                    <td>
                      {p.lines.reduce((a, l) => a + l.received, 0)} /{" "}
                      {p.lines.reduce((a, l) => a + l.quantity, 0)} unit
                    </td>
                    <td>
                      {money(
                        p.lines.reduce((a, l) => a + l.cost * l.quantity, 0),
                      )}
                    </td>
                    <td>
                      <Badge>{p.status}</Badge>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelected(p.id);
                          show("detail");
                        }}
                      >
                        Lihat detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!(tab === "Pemasok" ? suppliers : orders).length && (
          <Empty>Tidak ada data yang sesuai filter.</Empty>
        )}
      </section>
      <Modal
        wide
        open={dialog === "create"}
        onOpenChange={() => setDialog("")}
        title="Buat pesanan pembelian"
        description="Draft tidak mengubah stok dan tidak dikirim ke pemasok. Anda dapat meninjau sebelum menyetujui."
      >
        <div className="ops-form">
          <div className="ops-form-grid">
            <Field label="Outlet tujuan">
              <StoreSelect value={store} onChange={setStore} />
            </Field>
            <Field label="Pemasok">
              <select
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              >
                {state.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {lines.map((l, i) => (
            <div className="ops-order-line" key={i}>
              <Field label="Produk">
                <select
                  value={l.productId}
                  onChange={(e) => {
                    const p = state.products.find(
                      (p) => p.id === e.target.value,
                    )!;
                    setLines(
                      lines.map((x, j) =>
                        j === i ? { ...x, productId: p.id, cost: p.cost } : x,
                      ),
                    );
                  }}
                >
                  {state.products
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.variant}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Jumlah">
                <NumericInput
                  min="1"
                  value={l.quantity}
                  onValueChange={(value) =>
                    setLines(
                      lines.map((x, j) =>
                        j === i ? { ...x, quantity: value } : x,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Harga beli / unit">
                <NumericInput
                  min="0"
                  value={l.cost}
                  onValueChange={(value) =>
                    setLines(
                      lines.map((x, j) =>
                        j === i ? { ...x, cost: value } : x,
                      ),
                    )
                  }
                />
              </Field>
              <button
                className="icon-button"
                aria-label={`Hapus baris ${i + 1}`}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            className="button secondary"
            disabled={
              lines.length >= state.products.filter((p) => !p.archived).length
            }
            onClick={() => {
              const p = state.products.find(
                (p) => !p.archived && !lines.some((l) => l.productId === p.id),
              );
              if (p)
                setLines([
                  ...lines,
                  { productId: p.id, quantity: 1, cost: p.cost },
                ]);
            }}
          >
            <Plus size={16} /> Tambah baris
          </button>
          <div className="ops-review">
            <span>Estimasi pembelian</span>
            <strong>
              {money(lines.reduce((a, l) => a + l.cost * l.quantity, 0))}
            </strong>
          </div>
          <ErrorNote error={error} />
          <button
            className="button primary full"
            disabled={
              store === "all" ||
              !supplier ||
              !lines.length ||
              lines.some(
                (line) => !line.productId || line.quantity < 1 || line.cost < 0,
              )
            }
            onClick={create}
          >
            Simpan draft PO
          </button>
        </div>
      </Modal>
      <Modal
        wide
        open={["detail", "receive", "cancel"].includes(dialog) && !!po}
        onOpenChange={() => setDialog("")}
        title={
          dialog === "receive"
            ? review
              ? "Tinjau penerimaan"
              : "Terima barang"
            : dialog === "cancel"
              ? "Batalkan sisa pesanan"
              : po?.id || "Pesanan"
        }
        description="Owner · Penerimaan dapat dilakukan sebagian; stok bertambah hanya untuk barang yang diterima."
      >
        {po && (
          <div className="ops-form">
            <div className="ops-keyvalue">
              <span>
                {state.suppliers.find((s) => s.id === po.supplier)?.name}
                <small>{outletName(po.outlet)}</small>
              </span>
              <Badge>{po.status}</Badge>
            </div>
            {dialog === "cancel" ? (
              <>
                <Field label="Alasan pembatalan">
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </Field>
                <p>
                  Barang yang sudah diterima tetap tercatat. Sisa pesanan tidak
                  lagi dihitung sebagai stok masuk.
                </p>
              </>
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th>Dipesan / diterima</th>
                      <th>
                        {dialog === "receive"
                          ? "Diterima sekarang"
                          : "Harga beli"}
                      </th>
                      {dialog === "receive" && <th>Biaya aktual / unit</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {po.lines.map((l, i) => (
                      <tr key={i}>
                        <td>
                          {
                            state.products.find((p) => p.id === l.productId)
                              ?.name
                          }
                          {dialog === "receive" && (
                            <small>
                              Stok{" "}
                              {balance(state, po.outlet, l.productId).stock} →{" "}
                              {balance(state, po.outlet, l.productId).stock +
                                (receipts[i]?.quantity || 0)}
                            </small>
                          )}
                        </td>
                        <td>
                          {l.quantity} / {l.received}
                        </td>
                        <td>
                          {dialog === "receive" ? (
                            <NumericInput
                              aria-label={`Jumlah diterima ${state.products.find((p) => p.id === l.productId)?.name}`}
                              disabled={review}
                              min="0"
                              max={l.quantity - l.received}
                              value={receipts[i]?.quantity || 0}
                              onValueChange={(value) =>
                                setReceipts(
                                  receipts.map((r, j) =>
                                    j === i
                                      ? {
                                          ...r,
                                          quantity: value,
                                        }
                                      : r,
                                  ),
                                )
                              }
                            />
                          ) : (
                            money(l.cost)
                          )}
                        </td>
                        {dialog === "receive" && (
                          <td>
                            <NumericInput
                              aria-label={`Biaya aktual ${state.products.find((p) => p.id === l.productId)?.name}`}
                              disabled={review}
                              min="0"
                              value={receipts[i]?.cost || 0}
                              onValueChange={(value) =>
                                setReceipts(
                                  receipts.map((r, j) =>
                                    j === i ? { ...r, cost: value } : r,
                                  ),
                                )
                              }
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {review && dialog === "receive" && (
              <div className="ops-review">
                <span>Nilai penerimaan</span>
                <strong>
                  {money(receipts.reduce((a, r) => a + r.quantity * r.cost, 0))}
                </strong>
              </div>
            )}
            <ErrorNote error={error} />
            <div className="dialog-actions">
              {dialog === "detail" ? (
                <>
                  <ExportButton
                    onClick={() =>
                      csvDownload(`${po.id}.csv`, [
                        [
                          "PO",
                          "Outlet",
                          "Pemasok",
                          "Produk",
                          "Jumlah",
                          "Diterima",
                          "Biaya",
                        ],
                        ...po.lines.map((l) => [
                          po.id,
                          outletName(po.outlet),
                          state.suppliers.find((s) => s.id === po.supplier)
                            ?.name || "",
                          state.products.find((p) => p.id === l.productId)
                            ?.name || "",
                          l.quantity,
                          l.received,
                          l.cost,
                        ]),
                      ])
                    }
                  />
                  {!["Selesai", "Dibatalkan"].includes(po.status) && (
                    <button
                      className="button secondary"
                      onClick={() => {
                        setCancelReason("");
                        show("cancel");
                      }}
                    >
                      Batalkan sisa
                    </button>
                  )}
                  {po.status === "Draft" ? (
                    <button
                      className="button primary"
                      onClick={async () => {
                        if (
                          !(
                            await commit((s) => {
                              s.purchases.find((p) => p.id === po.id)!.status =
                                "Disetujui";
                              audit(s, `PO disetujui: ${po.id}`);
                            })
                          ).ok
                        )
                          return;
                        notify("PO disetujui. Barang siap diterima.");
                      }}
                    >
                      Setujui pesanan
                    </button>
                  ) : (
                    ["Disetujui", "Diterima sebagian"].includes(po.status) && (
                      <button
                        className="button primary"
                        onClick={() => {
                          setReceipts(
                            po.lines.map((l) => ({
                              quantity: l.quantity - l.received,
                              cost: l.cost,
                            })),
                          );
                          show("receive");
                        }}
                      >
                        <PackageCheck size={16} /> Terima barang
                      </button>
                    )
                  )}
                </>
              ) : dialog === "cancel" ? (
                <button
                  className="button primary"
                  disabled={!cancelReason.trim()}
                  onClick={async () => {
                    if (
                      !(
                        await commit((s) => {
                          s.purchases.find((p) => p.id === po.id)!.status =
                            "Dibatalkan";
                          audit(s, `Batalkan ${po.id}: ${cancelReason}`);
                        })
                      ).ok
                    )
                      return;
                    setDialog("detail");
                  }}
                >
                  Konfirmasi pembatalan
                </button>
              ) : (
                <>
                  <button
                    className="button secondary"
                    onClick={() =>
                      review ? setReview(false) : setDialog("detail")
                    }
                  >
                    Kembali
                  </button>
                  <button
                    className="button primary"
                    onClick={() => {
                      if (review) receive();
                      else {
                        try {
                          receivePurchase(
                            structuredClone(state),
                            po.id,
                            receipts,
                          );
                          setReview(true);
                          setError("");
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }
                    }}
                  >
                    {review ? "Konfirmasi penerimaan" : "Tinjau penerimaan"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={dialog === "supplier"}
        onOpenChange={() => setDialog("")}
        title="Data pemasok"
        description="Kontak pemasok disimpan hanya di sesi . Tidak ada pesan yang dikirim."
      >
        <form
          className="ops-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await commit((s) => {
              if (!supplierForm.name.trim())
                throw new Error("Nama pemasok wajib diisi.");
              if (
                s.suppliers.some(
                  (x) =>
                    x.id !== supplierForm.id &&
                    x.name.toLowerCase() === supplierForm.name.toLowerCase(),
                )
              )
                throw new Error("Nama pemasok sudah terdaftar.");
              const old = s.suppliers.find((x) => x.id === supplierForm.id);
              if (old) Object.assign(old, supplierForm);
              else s.suppliers.push(supplierForm);
              audit(s, `Pemasok disimpan: ${supplierForm.name}`);
            });
            if (!r.ok) setError(r.error);
            else {
              setDialog("");
              notify("Pemasok disimpan.");
            }
          }}
        >
          {(["name", "phone", "address"] as const).map((k, i) => (
            <Field key={k} label={["Nama pemasok", "Telepon", "Alamat"][i]}>
              <input
                required={k === "name"}
                value={supplierForm[k]}
                onChange={(e) =>
                  setSupplierForm({ ...supplierForm, [k]: e.target.value })
                }
              />
            </Field>
          ))}
          <ErrorNote error={error} />
          <button className="button primary full">Simpan pemasok</button>
        </form>
      </Modal>
    </div>
  );
}
