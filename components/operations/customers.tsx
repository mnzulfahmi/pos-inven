"use client";
import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { useBusiness } from "../business-provider";
import { useWorkspace } from "../workspace-context";
import { Modal } from "../ui";
import { money } from "@/lib/demo-data";
import { uid, audit, type Customer } from "@/lib/operations";
import {
  PageHeading,
  DemoNote,
  SearchBox,
  Field,
  ErrorNote,
  Empty,
  Stats,
  Badge,
  FlowLink,
} from "./shared";
export function CustomersPage() {
  const { state, commit } = useBusiness();
  const { outlet, notify } = useWorkspace();
  const [search, setSearch] = useState(""),
    [form, setForm] = useState<Customer | null>(null),
    [selected, setSelected] = useState(""),
    [error, setError] = useState("");
  const rows = state.customers.filter((c) =>
    `${c.name} ${c.phone} ${c.email}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const salesFor = (id: string) =>
    state.sales.filter(
      (s) => s.customer === id && (outlet === "all" || s.outlet === outlet),
    );
  const totalFor = (id: string) =>
    salesFor(id).reduce(
      (a, s) =>
        a +
        s.total -
        state.refunds
          .filter((r) => r.sale === s.id)
          .reduce((b, r) => b + r.amount, 0),
      0,
    );
  const customer = state.customers.find((c) => c.id === selected);
  return (
    <div className="ops-page">
      <PageHeading
        eyebrow="HUBUNGAN PELANGGAN"
        title="Pelanggan"
        description="Kenali pelanggan yang kembali dan riwayat belanja mereka."
      >
        <button
          className="button primary"
          onClick={() => {
            setError("");
            setForm({
              id: uid("CUS"),
              name: "",
              phone: "",
              email: "",
              note: "",
            });
          }}
        >
          <Plus size={17} /> Tambah pelanggan
        </button>
      </PageHeading>
      <DemoNote />
      <Stats
        items={[
          {
            label: "Pelanggan terdaftar",
            value: state.customers.length,
            hint: "Direktori bersama seluruh outlet",
          },
          {
            label: "Pelanggan bertransaksi",
            value: state.customers.filter((c) => salesFor(c.id).length).length,
            hint: "Dalam riwayat  outlet terpilih",
          },
          {
            label: "Belanja tercatat",
            value: money(
              state.customers.reduce((a, c) => a + totalFor(c.id), 0),
            ),
            hint: "Setelah refund, termasuk pajak",
          },
        ]}
      />
      <section className="panel">
        <div className="ops-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Cari nama, telepon, atau email…"
          />
          <Badge>{rows.length} pelanggan</Badge>
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Pelanggan</th>
                <th>Kontak</th>
                <th>Transaksi</th>
                <th>Total belanja</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="ops-product-cell">
                      <span className="ops-customer-avatar">
                        {c.name
                          .split(" ")
                          .map((x) => x[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <div>
                        <strong>{c.name}</strong>
                        <small>{c.note || "Pelanggan terdaftar"}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {c.phone || "—"}
                    <small>{c.email || "Tanpa email"}</small>
                  </td>
                  <td>{salesFor(c.id).length}</td>
                  <td>
                    <b>{money(totalFor(c.id))}</b>
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setSelected(c.id)}
                    >
                      Lihat profil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty>
            <Users size={30} />
            <h3>Belum ada pelanggan yang cocok</h3>
            <p>Tambahkan pelanggan untuk menghubungkan riwayat belanjanya.</p>
          </Empty>
        )}
      </section>
      <Modal
        open={!!form}
        onOpenChange={() => setForm(null)}
        title="Data pelanggan"
        description="Gunakan data contoh untuk prototipe ini. Semua perubahan hanya tersedia selama sesi."
      >
        {form && (
          <form
            className="ops-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await commit((s) => {
                if (!form.name.trim())
                  throw new Error("Nama pelanggan wajib diisi.");
                if (
                  form.phone &&
                  s.customers.some(
                    (c) => c.id !== form.id && c.phone === form.phone,
                  )
                )
                  throw new Error("Nomor telepon sudah terdaftar.");
                const old = s.customers.find((c) => c.id === form.id);
                if (old) Object.assign(old, form);
                else s.customers.push(form);
                audit(s, `Pelanggan disimpan: ${form.name}`);
              });
              if (!r.ok) setError(r.error);
              else {
                setForm(null);
                notify("Pelanggan  disimpan.");
              }
            }}
          >
            {(["name", "phone", "email", "note"] as const).map((k, i) => (
              <Field
                key={k}
                label={
                  [
                    "Nama lengkap",
                    "Telepon (opsional)",
                    "Email (opsional)",
                    "Catatan",
                  ][i]
                }
              >
                <input
                  required={k === "name"}
                  type={
                    k === "email" ? "email" : k === "phone" ? "tel" : "text"
                  }
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </Field>
            ))}
            <ErrorNote error={error} />
            <button className="button primary full">Simpan pelanggan</button>
          </form>
        )}
      </Modal>
      <Modal
        open={!!customer}
        onOpenChange={() => setSelected("")}
        title={customer?.name || "Pelanggan"}
        description="Riwayat transaksi yang tercatat pada outlet terpilih dalam ."
      >
        {customer && (
          <div className="ops-form">
            <div className="ops-review">
              <span>
                {customer.phone || "Tanpa telepon"}
                <small>{customer.email}</small>
              </span>
              <strong>{money(totalFor(customer.id))}</strong>
            </div>
            <p>{customer.note}</p>
            {salesFor(customer.id).map((s) => (
              <div className="ops-keyvalue" key={s.id}>
                <span>
                  {s.id}
                  <small>{s.date}</small>
                </span>
                <b>{money(s.total)}</b>
              </div>
            ))}
            {!salesFor(customer.id).length && (
              <Empty>Belum ada transaksi tercatat.</Empty>
            )}
            <div className="dialog-actions">
              <button
                className="button secondary"
                onClick={() => {
                  setForm({ ...customer });
                  setSelected("");
                  setError("");
                }}
              >
                Edit pelanggan
              </button>
              <FlowLink href="/transactions">Buka transaksi</FlowLink>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
