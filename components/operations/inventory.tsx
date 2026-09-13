"use client";
import { useState } from "react";
import {
  Plus,
  Upload,
  ClipboardCheck,
  Package,
  Pencil,
  ImagePlus,
  Trash2,
} from "lucide-react";
import { useBusiness } from "../business-provider";
import { useWorkspace } from "../workspace-context";
import { Modal, ProductIcon } from "../ui";
import { money, outletName } from "@/lib/demo-data";
import {
  balance,
  saveProduct,
  stockCount,
  parseProductCsv,
  uid,
  whole,
  audit,
  type Product,
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
  Stats,
  NeedOutlet,
  ExportButton,
  csvDownload,
  FlowLink,
  FieldHelp,
} from "./shared";
type VariantAttribute = { id: string; type: string; value: string };
const variantTypes = [
  "Ukuran",
  "Warna",
  "Rasa",
  "Kemasan",
  "Material",
  "Model",
  "Lainnya",
];
const variantPlaceholder: Record<string, string> = {
  Ukuran: "Contoh: S, 250 ml, 1 liter",
  Warna: "Contoh: Hitam, Merah",
  Rasa: "Contoh: Original, Pedas",
  Kemasan: "Contoh: Botol, Sachet",
  Material: "Contoh: Katun, Plastik",
  Model: "Contoh: Regular, Slim fit",
  Lainnya: "Masukkan nilai varian",
};
function parseVariant(value: string): VariantAttribute[] {
  if (!value || value === "Default")
    return [{ id: uid("VAR"), type: "Ukuran", value: "" }];
  const parts = value.split(" · ");
  if (!parts.every((part) => part.includes(":")))
    return [{ id: uid("VAR"), type: "Lainnya", value }];
  return parts.map((part) => {
    const [type, ...rest] = part.split(":");
    return {
      id: uid("VAR"),
      type: variantTypes.includes(type.trim()) ? type.trim() : "Lainnya",
      value: rest.join(":").trim(),
    };
  });
}
function variantLabel(attributes: VariantAttribute[]) {
  const complete = attributes.filter((attribute) => attribute.value.trim());
  return complete.length
    ? complete
        .map((attribute) => `${attribute.type}: ${attribute.value.trim()}`)
        .join(" · ")
    : "Default";
}
const newProduct = (): Product => ({
  id: uid("PRD"),
  name: "",
  variant: "Default",
  sku: "",
  barcode: "",
  category: "Lainnya",
  price: 0,
  cost: 0,
  icon: "bottle",
  color: "blue",
  share: 0,
  archived: false,
});
export function InventoryPage() {
  const { state, commit } = useBusiness();
  const owner = state.remote?.role === "owner";
  const cashier = state.remote?.role === "cashier";
  const { outlet, notify } = useWorkspace();
  const store = outlet as StoreId;
  const [tab, setTab] = useState("Produk"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("Aktif"),
    [dialog, setDialog] = useState(""),
    [error, setError] = useState(""),
    [product, setProduct] = useState<Product | null>(null),
    [productImage, setProductImage] = useState<File | null>(null),
    [imagePreview, setImagePreview] = useState(""),
    [variantAttributes, setVariantAttributes] = useState<VariantAttribute[]>(
      () => parseVariant("Default"),
    ),
    [uploading, setUploading] = useState(false),
    [minimum, setMinimum] = useState(0),
    [reason, setReason] = useState(""),
    [countRows, setCountRows] = useState<
      { productId: string; physical: number; version: number; before: number }[]
    >([]),
    [proposalId, setProposalId] = useState(""),
    [review, setReview] = useState(false),
    [imports, setImports] = useState<ReturnType<typeof parseProductCsv>>([]);
  const rows = state.products.filter(
    (p) =>
      (filter === "Semua" || (filter === "Arsip" ? p.archived : !p.archived)) &&
      `${p.name} ${p.sku} ${p.barcode}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const balances = state.balances.filter(
    (b) =>
      (outlet === "all" || b.outlet === outlet) &&
      !state.products.find((p) => p.id === b.productId)?.archived,
  );
  const stock = (id: string) =>
    balances.filter((b) => b.productId === id).reduce((a, b) => a + b.stock, 0);
  const ledger = state.ledger.filter(
    (l) =>
      (outlet === "all" || l.outlet === outlet) &&
      `${l.reason} ${state.products.find((p) => p.id === l.productId)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function show(d: string) {
    setDialog(d);
    setError("");
    setReview(false);
  }
  async function save() {
    if (!product) return;
    setUploading(true);
    setError("");
    try {
      let nextProduct = {
        ...product,
        variant: variantLabel(variantAttributes),
      };
      if (productImage) {
        const form = new FormData();
        form.set("file", productImage);
        form.set("purpose", "product");
        const response = await fetch("/api/files", {
          method: "POST",
          body: form,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Gagal mengunggah gambar");
        nextProduct = {
          ...product,
          imageFileId: result.id,
          image: result.src,
        };
      }
      const r = await commit((s) => {
        saveProduct(s, nextProduct);
        if (outlet !== "all") {
          if (!whole(minimum))
            throw new Error(
              "Stok minimum harus bilangan bulat positif atau nol.",
            );
          let b = s.balances.find(
            (b) => b.productId === nextProduct.id && b.outlet === store,
          );
          if (!b) {
            b = balance(s, store, nextProduct.id);
            s.balances.push(b);
          }
          b.minimum = minimum;
        }
      });
      if (!r.ok) setError(r.error);
      else {
        setDialog("");
        setProductImage(null);
        notify("Produk disimpan. Gambar siap digunakan di katalog dan kasir.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  function startCount() {
    setProposalId("");
    setCountRows(
      state.products
        .filter((p) => !p.archived)
        .map((p) => {
          const b = balance(state, store, p.id);
          return {
            productId: p.id,
            physical: b.stock,
            before: b.stock,
            version: b.version,
          };
        }),
    );
    setReason("");
    show("count");
  }
  async function saveCount() {
    const r = await commit((s) => {
      stockCount(s, store, countRows, reason);
      if (proposalId)
        s.proposals.find((p) => p.id === proposalId)!.status = "Disetujui";
    });
    if (!r.ok) setError(r.error);
    else {
      setDialog("");
      notify(
        state.remote?.role === "inventory"
          ? "Opname diajukan untuk persetujuan. Stok belum berubah."
          : "Opname disetujui. Stok dan ledger diperbarui.",
      );
    }
  }
  return (
    <div className="ops-page">
      <PageHeading
        eyebrow="PERSEDIAAN"
        title="Inventori"
        description="Kenali setiap produk. Jaga stok tetap siap untuk pelanggan."
      >
        <button
          className="button secondary"
          hidden={!owner}
          onClick={() => {
            show("import");
            setImports([]);
          }}
        >
          <Upload size={16} /> Impor CSV
        </button>
        <button
          className="button primary"
          hidden={!owner}
          onClick={() => {
            setProduct(newProduct());
            setProductImage(null);
            setImagePreview("");
            setVariantAttributes(parseVariant("Default"));
            setMinimum(0);
            show("product");
          }}
        >
          <Plus size={17} /> Tambah produk
        </button>
      </PageHeading>
      <DemoNote />
      <Stats
        items={[
          {
            label: "Produk aktif",
            value: state.products.filter((p) => !p.archived).length,
            hint: "SKU dan varian unik",
          },
          {
            label: "Unit tersedia",
            value: stockTotal(balances),
            hint: outletName(outlet),
          },
          {
            label: "Nilai persediaan",
            value: cashier
              ? "—"
              : money(balances.reduce((a, b) => a + b.stock * b.cost, 0)),
            hint: cashier
              ? "Tidak tersedia untuk peran kasir"
              : "Biaya rata-rata bergerak",
          },
          {
            label: "Di bawah minimum",
            value: balances.filter((b) => b.stock <= b.minimum).length,
            hint: "Pasangan produk dan outlet",
          },
        ]}
      />
      <div className="ops-section-top">
        <Tabs
          items={
            cashier ? ["Produk"] : ["Produk", "Stok opname", "Pergerakan stok"]
          }
          value={tab}
          onChange={setTab}
        />
        {!cashier && <FlowLink href="/purchases">Restock produk</FlowLink>}
      </div>
      {tab === "Produk" ? (
        <section className="panel">
          <div className="ops-toolbar">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Cari nama, SKU, atau barcode…"
            />
            <select
              aria-label="Status produk"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {["Aktif", "Arsip", "Semua"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <ExportButton
              onClick={() =>
                csvDownload("inventori-.csv", [
                  ["Produk", "SKU", "Outlet", "Stok", "Nilai"],
                  ...rows.map((p) => [
                    p.name,
                    p.sku,
                    outletName(outlet),
                    stock(p.id),
                    balances
                      .filter((b) => b.productId === p.id)
                      .reduce((a, b) => a + b.stock * b.cost, 0),
                  ]),
                ])
              }
            />
          </div>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Produk / varian</th>
                  <th>SKU</th>
                  <th>Kategori</th>
                  <th>Harga jual</th>
                  <th>Stok</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="ops-product-cell">
                        <ProductIcon
                          icon={p.icon}
                          color={p.color}
                          image={p.image}
                          name={p.name}
                        />
                        <div>
                          <strong>{p.name}</strong>
                          <small>{p.variant}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {p.sku}
                      <small>{p.barcode || "Tanpa barcode"}</small>
                    </td>
                    <td>{p.category}</td>
                    <td>{money(p.price)}</td>
                    <td>
                      <b>{stock(p.id)}</b> unit
                    </td>
                    <td>
                      <Badge>
                        {p.archived
                          ? "Diarsipkan"
                          : stock(p.id)
                            ? "Aktif"
                            : "Stok habis"}
                      </Badge>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        hidden={!owner}
                        aria-label={`Edit ${p.name}`}
                        onClick={() => {
                          setProduct({ ...p });
                          setProductImage(null);
                          setImagePreview(p.image || "");
                          setVariantAttributes(parseVariant(p.variant));
                          setMinimum(balance(state, store, p.id).minimum);
                          show("product");
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <Empty>Belum ada produk yang cocok.</Empty>}
        </section>
      ) : tab === "Stok opname" ? (
        <>
          {outlet === "all" ? (
            <NeedOutlet />
          ) : (
            <section className="panel ops-callout">
              <div className="ops-callout-icon">
                <ClipboardCheck size={32} />
              </div>
              <div>
                <h2>Samakan catatan dengan stok fisik</h2>
                <p>
                  Hitung stok {outletName(outlet)}, beri alasan selisih, lalu
                  tinjau perubahan. Perubahan stok selama proses akan
                  membatalkan pratinjau lama.
                </p>
              </div>
              <button className="button primary" onClick={startCount}>
                Mulai opname
              </button>
            </section>
          )}
          <section className="panel ops-section">
            <h2>Usulan dari AI</h2>
            {state.proposals
              .filter((p) => outlet === "all" || p.outlet === outlet)
              .map((p) => (
                <div className="ops-keyvalue" key={p.id}>
                  <span>
                    {state.products.find((x) => x.id === p.productId)?.name}
                    <small>
                      {outletName(p.outlet)} · Fisik {p.physical} · {p.reason}
                    </small>
                  </span>
                  {p.status === "Menunggu" ? (
                    <button
                      className="button secondary compact"
                      disabled={outlet === "all" || outlet !== p.outlet}
                      onClick={() => {
                        setProposalId(p.id);
                        setCountRows([
                          {
                            productId: p.productId,
                            physical: p.physical,
                            version: p.version,
                            before: balance(state, p.outlet, p.productId).stock,
                          },
                        ]);
                        setReason(p.reason);
                        show("count");
                      }}
                    >
                      Tinjau usulan
                    </button>
                  ) : (
                    <Badge>{p.status}</Badge>
                  )}
                </div>
              ))}
            {outlet === "all" && state.proposals.length > 0 && (
              <p className="ops-caption">
                Pilih outlet usulan di bagian atas untuk meninjaunya.
              </p>
            )}
            <h2 style={{ marginTop: 24 }}>Riwayat penyesuaian</h2>
            {state.ledger
              .filter(
                (l) =>
                  (outlet === "all" || l.outlet === outlet) &&
                  l.reason.startsWith("Opname"),
              )
              .map((l) => (
                <div className="ops-keyvalue" key={l.id}>
                  <span>
                    {state.products.find((p) => p.id === l.productId)?.name}
                    <small>{l.reason}</small>
                  </span>
                  <b>
                    {l.delta > 0 ? "+" : ""}
                    {l.delta} → {l.after} unit
                  </b>
                </div>
              ))}
            {!state.ledger.some(
              (l) =>
                (outlet === "all" || l.outlet === outlet) &&
                l.reason.startsWith("Opname"),
            ) && <Empty>Belum ada opname dalam sesi ini.</Empty>}
          </section>
        </>
      ) : (
        <section className="panel">
          <div className="ops-toolbar">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Cari produk atau referensi…"
            />
            <ExportButton
              onClick={() =>
                csvDownload("ledger-stok-.csv", [
                  ["Referensi", "Outlet", "Produk", "Perubahan", "Saldo"],
                  ...ledger.map((l) => [
                    l.reason,
                    l.outlet,
                    l.productId,
                    l.delta,
                    l.after,
                  ]),
                ])
              }
            />
          </div>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Outlet</th>
                  <th>Referensi / alasan</th>
                  <th>Perubahan</th>
                  <th>Saldo setelah</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {state.products.find((p) => p.id === l.productId)?.name}
                    </td>
                    <td>{outletName(l.outlet)}</td>
                    <td>{l.reason}</td>
                    <td
                      className={l.delta < 0 ? "ops-negative" : "ops-positive"}
                    >
                      {l.delta > 0 ? "+" : ""}
                      {l.delta}
                    </td>
                    <td>{l.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!ledger.length && (
            <Empty>
              <Package size={30} />
              <h3>Belum ada pergerakan dalam sesi ini</h3>
              <p>
                Penjualan, penerimaan, refund, dan opname akan muncul di sini.
              </p>
            </Empty>
          )}
        </section>
      )}
      <Modal
        open={dialog === "product"}
        onOpenChange={() => setDialog("")}
        title={
          state.products.some((p) => p.id === product?.id)
            ? "Edit produk & varian"
            : "Tambah produk"
        }
        description="Setiap varian memiliki SKU dan barcode unik. Saldo awal dicatat terpisah melalui opname."
      >
        <div className="ops-form">
          {product && (
            <>
              <div className="ops-product-image-field">
                <div className="ops-product-image-preview">
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt={`Pratinjau ${product.name || "produk"}`}
                    />
                  ) : (
                    <ProductIcon icon={product.icon} color={product.color} />
                  )}
                </div>
                <div>
                  <strong>Gambar produk</strong>
                  <p>
                    PNG atau JPG, maksimal 5 MB. Rasio persegi tampil paling
                    baik.
                  </p>
                  <div className="ops-inline-actions">
                    <label className="button secondary compact">
                      <ImagePlus size={16} />
                      {imagePreview ? "Ganti gambar" : "Pilih gambar"}
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          setError("");
                          if (!file) return;
                          if (
                            file.size > 5_000_000 ||
                            !["image/png", "image/jpeg"].includes(file.type)
                          ) {
                            setError(
                              "Gunakan gambar PNG atau JPG maksimal 5 MB.",
                            );
                            return;
                          }
                          setProductImage(file);
                          setImagePreview(URL.createObjectURL(file));
                        }}
                      />
                    </label>
                    {imagePreview && (
                      <button
                        type="button"
                        className="button ghost compact"
                        onClick={() => {
                          setProductImage(null);
                          setImagePreview("");
                          setProduct({
                            ...product,
                            image: "",
                            imageFileId: "",
                          });
                        }}
                      >
                        <Trash2 size={15} /> Hapus
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="ops-form-grid">
                <Field label="Nama produk">
                  <input
                    value={product.name}
                    onChange={(e) =>
                      setProduct({ ...product, name: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Kategori"
                  hint="Kelompok produk untuk memudahkan pencarian dan laporan. Anda dapat memilih kategori yang ada atau mengetik kategori baru."
                  hintAlign="end"
                >
                  <input
                    list="product-categories"
                    value={product.category}
                    placeholder="Pilih atau ketik kategori baru"
                    onChange={(e) =>
                      setProduct({ ...product, category: e.target.value })
                    }
                  />
                  <datalist id="product-categories">
                    {[...new Set(state.products.map((p) => p.category))].map(
                      (category) => (
                        <option key={category} value={category} />
                      ),
                    )}
                  </datalist>
                </Field>
                <div className="ops-variant-builder">
                  <div className="ops-field-label">
                    Atribut varian
                    <FieldHelp text="Gunakan atribut untuk membedakan varian produk yang memiliki SKU sendiri, misalnya Ukuran: 250 ml dan Rasa: Original." />
                  </div>
                  <p>
                    Tambahkan satu atau beberapa atribut yang menjelaskan varian
                    ini.
                  </p>
                  <div className="ops-variant-rows">
                    {variantAttributes.map((attribute, index) => (
                      <div className="ops-variant-row" key={attribute.id}>
                        <select
                          aria-label={`Jenis atribut varian ${index + 1}`}
                          value={attribute.type}
                          onChange={(e) =>
                            setVariantAttributes(
                              variantAttributes.map((item) =>
                                item.id === attribute.id
                                  ? { ...item, type: e.target.value }
                                  : item,
                              ),
                            )
                          }
                        >
                          {variantTypes.map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                        <input
                          aria-label={`Nilai atribut varian ${index + 1}`}
                          value={attribute.value}
                          placeholder={variantPlaceholder[attribute.type]}
                          onChange={(e) =>
                            setVariantAttributes(
                              variantAttributes.map((item) =>
                                item.id === attribute.id
                                  ? { ...item, value: e.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Hapus atribut varian ${index + 1}`}
                          disabled={variantAttributes.length === 1}
                          onClick={() =>
                            setVariantAttributes(
                              variantAttributes.filter(
                                (item) => item.id !== attribute.id,
                              ),
                            )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="button secondary compact ops-add-variant"
                    onClick={() =>
                      setVariantAttributes([
                        ...variantAttributes,
                        { id: uid("VAR"), type: "Warna", value: "" },
                      ])
                    }
                  >
                    <Plus size={15} /> Tambah atribut
                  </button>
                </div>
                <Field
                  label="SKU"
                  hint="Kode unik internal untuk mengidentifikasi dan mencari varian ini. Setiap varian harus memiliki SKU yang berbeda."
                >
                  <input
                    value={product.sku}
                    onChange={(e) =>
                      setProduct({ ...product, sku: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Barcode (opsional)"
                  hint="Kode yang dipindai saat transaksi. Kosongkan jika produk tidak memiliki barcode."
                  hintAlign="end"
                >
                  <input
                    value={product.barcode}
                    onChange={(e) =>
                      setProduct({ ...product, barcode: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Harga jual (Rp)"
                  hint="Harga yang dibayar pelanggan untuk satu unit varian produk ini, sebelum diskon."
                >
                  <NumericInput
                    min="0"
                    value={product.price}
                    onValueChange={(value) =>
                      setProduct({ ...product, price: value })
                    }
                  />
                </Field>
                <Field
                  label="Biaya awal produk baru (Rp)"
                  hint="Biaya modal per unit untuk menghitung nilai persediaan dan laba. Nilai ini dapat berubah saat menerima pembelian berikutnya."
                  hintAlign="end"
                >
                  <NumericInput
                    min="0"
                    value={product.cost}
                    onValueChange={(value) =>
                      setProduct({ ...product, cost: value })
                    }
                  />
                </Field>
                {outlet !== "all" && (
                  <Field label={`Stok minimum · ${outletName(outlet)}`}>
                    <NumericInput
                      min="0"
                      value={minimum}
                      onValueChange={setMinimum}
                    />
                  </Field>
                )}
              </div>
              <label className="ops-check">
                <input
                  type="checkbox"
                  checked={product.archived}
                  onChange={(e) =>
                    setProduct({ ...product, archived: e.target.checked })
                  }
                />{" "}
                Arsipkan produk (riwayat tetap tersimpan)
              </label>
              <ErrorNote error={error} />
              <button
                className="button primary full"
                disabled={uploading}
                onClick={save}
              >
                {uploading ? "Menyimpan produk…" : "Simpan produk"}
              </button>
            </>
          )}
        </div>
      </Modal>
      <Modal
        wide
        open={dialog === "count"}
        onOpenChange={() => setDialog("")}
        title={review ? "Tinjau hasil opname" : "Hitung stok fisik"}
        description={`Owner demo · ${outletName(outlet)} · Konfirmasi akan mengubah stok dan mencatat alasan di ledger.`}
      >
        <div className="ops-form">
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Tercatat</th>
                  <th>Fisik</th>
                  <th>Selisih</th>
                </tr>
              </thead>
              <tbody>
                {countRows.map((r, i) => (
                  <tr key={r.productId}>
                    <td>
                      {state.products.find((p) => p.id === r.productId)?.name}
                    </td>
                    <td>{r.before}</td>
                    <td>
                      <NumericInput
                        aria-label={`Stok fisik ${state.products.find((p) => p.id === r.productId)?.name}`}
                        min="0"
                        value={r.physical}
                        disabled={review}
                        onValueChange={(value) =>
                          setCountRows(
                            countRows.map((v, j) =>
                              i === j ? { ...v, physical: value } : v,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      {r.physical - r.before > 0 ? "+" : ""}
                      {r.physical - r.before}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Field label="Alasan penyesuaian">
            <textarea
              disabled={review}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <ErrorNote error={error} />
          <div className="dialog-actions">
            {review && (
              <button
                className="button secondary"
                onClick={() => setReview(false)}
              >
                Ubah hitungan
              </button>
            )}
            <button
              className="button primary"
              disabled={
                !reason.trim() || countRows.some((r) => !whole(r.physical))
              }
              onClick={() => (review ? saveCount() : setReview(true))}
            >
              {review ? "Setujui & terapkan opname" : "Tinjau perubahan"}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        wide
        open={dialog === "import"}
        onOpenChange={() => setDialog("")}
        title="Impor katalog produk"
        description="Unggah CSV, periksa setiap baris, lalu simpan. Duplikat SKU/barcode ditolak; produk lama tidak ditimpa."
      >
        <div className="ops-form">
          <button
            className="button secondary"
            onClick={() =>
              csvDownload("template-produk.csv", [
                [
                  "name",
                  "variant",
                  "sku",
                  "barcode",
                  "category",
                  "price",
                  "cost",
                ],
                [
                  "Teh Melati",
                  "250 ml",
                  "DRK-003",
                  "8990000000100",
                  "Minuman",
                  5000,
                  3200,
                ],
              ])
            }
          >
            Unduh template CSV
          </button>
          <Field label="File CSV (maks. 1 MB)">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                setError("");
                setImports([]);
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 1_000_000) {
                  setError("Ukuran maksimum 1 MB.");
                  return;
                }
                try {
                  const result = parseProductCsv(await f.text(), state);
                  if (result.length > 500)
                    throw new Error("Maksimum 500 produk per impor .");
                  setImports(result);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
          </Field>
          {imports.length > 0 && (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Baris</th>
                    <th>Produk</th>
                    <th>SKU</th>
                    <th>Validasi</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.product.name}</td>
                      <td>{r.product.sku}</td>
                      <td>{r.error || "Siap diimpor"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ErrorNote error={error} />
          <button
            className="button primary full"
            disabled={!imports.length || imports.some((r) => r.error)}
            onClick={async () => {
              const r = await commit((s) => {
                imports.forEach((row) =>
                  saveProduct(s, { ...row.product, id: uid("PRD") }),
                );
                audit(s, `Impor ${imports.length} produk`);
              });
              if (!r.ok) setError(r.error);
              else {
                setDialog("");
                notify(`${imports.length} produk demo diimpor.`);
              }
            }}
          >
            Konfirmasi impor {imports.length || ""} produk
          </button>
        </div>
      </Modal>
    </div>
  );
}
function stockTotal(rows: { stock: number }[]) {
  return rows.reduce((a, b) => a + b.stock, 0).toLocaleString("id-ID");
}
