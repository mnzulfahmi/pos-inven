"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  Store,
  Users,
  ShieldCheck,
  CreditCard,
  ExternalLink,
  Settings2,
  Upload,
} from "lucide-react";
import { useBusiness } from "../business-provider";
import { useWorkspace } from "../workspace-context";
import { Modal } from "../ui";
import { outlets, outletName, money } from "@/lib/demo-data";
import { uid, audit, activeShift, type StoreId } from "@/lib/operations";
import {
  PageHeading,
  DemoNote,
  Tabs,
  Field,
  NumericInput,
  ErrorNote,
  Badge,
  Empty,
  StoreSelect,
  FlowLink,
} from "./shared";
export function SettingsPage() {
  const { state, commit } = useBusiness();
  const { notify } = useWorkspace();
  const [tab, setTab] = useState("Profil usaha"),
    [form, setForm] = useState({ ...state.settings }),
    [dialog, setDialog] = useState(""),
    [error, setError] = useState(""),
    [member, setMember] = useState({
      name: "",
      email: "",
      role: "Cashier",
      outlet: (state.remote?.outlets?.find((o: any) => o.active)?.id ||
        "all") as StoreId,
    }),
    [register, setRegister] = useState({
      name: "",
      outlet: (state.remote?.outlets?.find((o: any) => o.active)?.id ||
        "all") as StoreId,
    }),
    [invoiceId, setInvoiceId] = useState(""),
    [proof, setProof] = useState("");
  const invoice = state.invoices.find((i) => i.id === invoiceId);
  function show(d: string) {
    setDialog(d);
    setError("");
  }
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("billing")) {
      setTab("Langganan");
      notify(
        "Status pembayaran Mayar akan diperbarui otomatis setelah pembayaran terverifikasi.",
      );
    }
  }, []);
  return (
    <div className="ops-page">
      <PageHeading
        eyebrow="RUANG KERJA"
        title="Pengaturan"
        description="Atur usaha, anggota tim, dan preferensi operasional Anda."
      >
        <FlowLink href="/onboarding">Panduan mulai</FlowLink>
      </PageHeading>
      <DemoNote />
      <Tabs
        items={[
          "Profil usaha",
          "Outlet & kasir",
          "Anggota tim",
          "Pajak & struk",
          "Langganan",
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "Profil usaha" || tab === "Pajak & struk" ? (
        <section className="panel ops-settings-panel">
          <div className="ops-settings-intro">
            <span className="ops-mini-icon">
              {tab === "Profil usaha" ? (
                <Store size={23} />
              ) : (
                <Settings2 size={23} />
              )}
            </span>
            <h2>
              {tab === "Profil usaha"
                ? "Identitas usaha"
                : "Preferensi transaksi"}
            </h2>
            <p>
              {tab === "Profil usaha"
                ? "Identitas ini akan muncul di kasir dan struk pelanggan."
                : "Perubahan berlaku untuk transaksi baru. Struk menggunakan profil usaha saat dicetak."}
            </p>
          </div>
          <form
            className="ops-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await commit((s) => {
                if (!form.name.trim())
                  throw new Error("Nama usaha wajib diisi.");
                if (
                  !Number.isFinite(form.tax) ||
                  form.tax < 0 ||
                  form.tax > 100 ||
                  !Number.isFinite(form.discount) ||
                  form.discount < 0 ||
                  form.discount > 100
                )
                  throw new Error("Persentase harus antara 0 dan 100.");
                s.settings = { ...form };
                audit(s, `Pengaturan disimpan: ${tab}`);
              });
              if (!r.ok) setError(r.error);
              else {
                setError("");
                notify("Pengaturan  disimpan.");
              }
            }}
          >
            {tab === "Profil usaha" ? (
              <>
                <Field label="Nama usaha">
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Alamat usaha">
                  <textarea
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                  />
                </Field>
                <div className="info-note">
                  Zona waktu Asia/Jakarta · Mata uang Rupiah (IDR) · Peran Anda:
                  Owner
                </div>
              </>
            ) : (
              <>
                <Field label="Pajak penjualan (%)">
                  <NumericInput
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.tax}
                    onValueChange={(value) => setForm({ ...form, tax: value })}
                  />
                </Field>
                <Field label="Diskon cepat di kasir (%)">
                  <NumericInput
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.discount}
                    onValueChange={(value) =>
                      setForm({ ...form, discount: value })
                    }
                  />
                </Field>
                <Field label="Pesan penutup struk">
                  <textarea
                    value={form.receipt}
                    onChange={(e) =>
                      setForm({ ...form, receipt: e.target.value })
                    }
                  />
                </Field>
                <p className="ops-caption">
                  Pajak ditambahkan setelah diskon. Nilai dibulatkan ke rupiah
                  terdekat.
                </p>
              </>
            )}
            <ErrorNote error={error} />
            <button className="button primary">Simpan perubahan</button>
          </form>
        </section>
      ) : tab === "Outlet & kasir" ? (
        <>
          <div className="ops-outlet-grid">
            {outlets
              .filter((o) => o.id !== "all")
              .map((o) => (
                <section className="panel ops-section" key={o.id}>
                  <span className="ops-mini-icon">
                    <Store size={23} />
                  </span>
                  <h2>{o.name}</h2>
                  <p>
                    {o.id === "buah-batu"
                      ? "Outlet baru · siap disiapkan"
                      : "Bandung, Jawa Barat"}
                  </p>
                  <Badge>
                    {
                      state.registers.filter(
                        (r) => r.outlet === o.id && r.active,
                      ).length
                    }{" "}
                    kasir aktif
                  </Badge>
                  <div className="ops-keyvalue">
                    <span>Anggota tim</span>
                    <b>
                      {
                        state.members.filter(
                          (m) => m.outlet === o.id && m.status === "Aktif",
                        ).length
                      }
                    </b>
                  </div>
                  <div className="ops-keyvalue">
                    <span>Shift</span>
                    <b>
                      {activeShift(state, o.id as StoreId)
                        ? "Aktif"
                        : "Belum dibuka"}
                    </b>
                  </div>
                  <button
                    className="button secondary full"
                    onClick={() => {
                      setRegister({
                        name: "Kasir 01",
                        outlet: o.id as StoreId,
                      });
                      show("register");
                    }}
                  >
                    Tambah register
                  </button>
                </section>
              ))}
          </div>
          <section className="panel ops-section">
            <h2>Register kasir</h2>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Outlet</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {state.registers.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{outletName(r.outlet)}</td>
                      <td>
                        <Badge>{r.active ? "Aktif" : "Nonaktif"}</Badge>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={async () => {
                            const result = await commit((s) => {
                              if (activeShift(s, r.outlet))
                                throw new Error(
                                  "Tutup shift outlet sebelum mengubah register.",
                                );
                              s.registers.find((x) => x.id === r.id)!.active =
                                !r.active;
                              audit(
                                s,
                                `Register ${r.name}: ${r.active ? "nonaktif" : "aktif"}`,
                              );
                            });
                            if (!result.ok) notify(result.error);
                            else notify("Status register diperbarui.");
                          }}
                        >
                          {r.active ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : tab === "Anggota tim" ? (
        <section className="panel">
          <div className="ops-toolbar">
            <div>
              <h2>
                <Users size={19} /> Tim Anda
              </h2>
              <small>
                Hak akses diberlakukan di server. Bagikan tautan undangan kepada
                anggota.
              </small>
            </div>
            <button className="button primary" onClick={() => show("member")}>
              <Plus size={16} /> Undang anggota
            </button>
          </div>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Anggota</th>
                  <th>Peran</th>
                  <th>Outlet</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {state.members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                      <small>{m.email}</small>
                    </td>
                    <td>{m.role}</td>
                    <td>{outletName(m.outlet)}</td>
                    <td>
                      <Badge>{m.status}</Badge>
                    </td>
                    <td>
                      {m.role !== "Owner" && (
                        <button
                          className="text-button"
                          onClick={async () => {
                            if (
                              !(
                                await commit((s) => {
                                  s.members.find((x) => x.id === m.id)!.status =
                                    m.status === "Nonaktif"
                                      ? "Aktif"
                                      : "Nonaktif";
                                  audit(s, `Status anggota ${m.name} diubah`);
                                })
                              ).ok
                            )
                              return;
                            notify("Status anggota  diperbarui.");
                          }}
                        >
                          {m.status === "Nonaktif" ? "Aktifkan" : "Nonaktifkan"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ops-permissions">
            <h3>Ringkasan peran</h3>
            <p>
              <b>Owner</b> · Seluruh operasional, persetujuan, tim, dan
              langganan.
            </p>
            <p>
              <b>Manager</b> · Inventori, pembelian, laporan, dan pengawasan
              outlet.
            </p>
            <p>
              <b>Cashier</b> · Shift, penjualan, pelanggan, dan struk.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="panel ops-callout">
            <span className="ops-mini-icon">
              <CreditCard size={25} />
            </span>
            <div>
              <h2>{state.subscription}</h2>
              <p>
                Periode berakhir{" "}
                {state.remote?.subscription?.period_end
                  ? new Date(
                      state.remote.subscription.period_end,
                    ).toLocaleDateString("id-ID")
                  : "—"}
                . Paket kedaluwarsa menjadi hanya-baca.
              </p>
            </div>
            <FlowLink href="/pricing">Bandingkan paket</FlowLink>
          </section>
          <section className="panel ops-section">
            <h2>Invoice pembayaran</h2>
            <p className="ops-caption">
              Checkout paket diproses oleh Mayar. Status dan aktivasi paket
              diperbarui otomatis setelah pembayaran terverifikasi.
            </p>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Paket</th>
                    <th>Nominal</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {state.invoices.map((i) => (
                    <tr key={i.id}>
                      <td>
                        {i.id}
                        <small>
                          {i.provider === "mayar"
                            ? `Mayar${i.expiresAt ? ` · berlaku sampai ${new Date(i.expiresAt).toLocaleString("id-ID")}` : ""}`
                            : i.proof || "Pembayaran manual"}
                        </small>
                      </td>
                      <td>{i.plan}</td>
                      <td>{money(i.amount)}</td>
                      <td>
                        <Badge>{i.status}</Badge>
                        {i.reason && <small>{i.reason}</small>}
                      </td>
                      <td>
                        {i.status === "Menunggu pembayaran" && i.paymentUrl ? (
                          <a
                            className="text-button"
                            href={i.paymentUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Bayar sekarang <ExternalLink size={14} />
                          </a>
                        ) : (
                          i.provider !== "mayar" &&
                          ["Menunggu bukti", "Ditolak"].includes(i.status) && (
                            <button
                              className="text-button"
                              onClick={() => {
                                setInvoiceId(i.id);
                                setProof("");
                                show("proof");
                              }}
                            >
                              Unggah bukti
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!state.invoices.length && (
              <Empty>
                Belum ada invoice. Mulai dengan memilih paket di halaman harga.
              </Empty>
            )}
          </section>
          <div className="ops-admin-link">
            <ShieldCheck size={17} />
            <span>Pratinjau alur operator platform</span>
            <FlowLink href="/admin">Buka konsol </FlowLink>
          </div>
        </>
      )}
      <Modal
        open={dialog === "member"}
        onOpenChange={() => setDialog("")}
        title="Undang anggota tim"
        description="Simulasi undangan tersimpan sebagai menunggu. Tidak ada email yang dikirim."
      >
        <form
          className="ops-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await commit((s) => {
              if (!member.name.trim() || !member.email.trim())
                throw new Error("Nama dan email wajib diisi.");
              if (
                s.members.some(
                  (m) => m.email.toLowerCase() === member.email.toLowerCase(),
                )
              )
                throw new Error("Email sudah terdaftar.");
              if (s.members.filter((m) => m.status !== "Nonaktif").length >= 5)
                throw new Error("Kapasitas Trial Pro: maksimum 5 anggota.");
              s.members.push({ ...member, id: uid("USR"), status: "Menunggu" });
              audit(s, `Undangan demo: ${member.email}`);
            });
            if (!r.ok) setError(r.error);
            else {
              setDialog("");
              setMember({ ...member, name: "", email: "" });
              notify("Undangan  tersimpan. Tidak ada email dikirim.");
            }
          }}
        >
          <Field label="Nama anggota">
            <input
              required
              value={member.name}
              onChange={(e) => setMember({ ...member, name: e.target.value })}
            />
          </Field>
          <Field label="Email contoh">
            <input
              type="email"
              required
              value={member.email}
              onChange={(e) => setMember({ ...member, email: e.target.value })}
            />
          </Field>
          <Field label="Peran">
            <select
              value={member.role}
              onChange={(e) => setMember({ ...member, role: e.target.value })}
            >
              <option>Cashier</option>
              <option>Manager</option>
            </select>
          </Field>
          <Field label="Outlet">
            <StoreSelect
              value={member.outlet}
              onChange={(outlet) => setMember({ ...member, outlet })}
            />
          </Field>
          <ErrorNote error={error} />
          <button className="button primary">Simpan undangan </button>
        </form>
      </Modal>
      <Modal
        open={dialog === "register"}
        onOpenChange={() => setDialog("")}
        title="Tambah register kasir"
        description="Satu shift aktif per outlet dalam . Register mengaktifkan alur pembukaan shift."
      >
        <form
          className="ops-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await commit((s) => {
              if (!register.name.trim())
                throw new Error("Nama register wajib diisi.");
              if (
                s.registers.some(
                  (r) =>
                    r.outlet === register.outlet &&
                    r.name.toLowerCase() === register.name.toLowerCase(),
                )
              )
                throw new Error("Nama register sudah dipakai pada outlet ini.");
              s.registers.push({ ...register, id: uid("REG"), active: true });
              audit(s, `Register ditambahkan: ${register.name}`);
            });
            if (!r.ok) setError(r.error);
            else {
              setDialog("");
              notify("Register  ditambahkan.");
            }
          }}
        >
          <Field label="Outlet">
            <StoreSelect
              value={register.outlet}
              onChange={(outlet) => setRegister({ ...register, outlet })}
            />
          </Field>
          <Field label="Nama register">
            <input
              required
              value={register.name}
              onChange={(e) =>
                setRegister({ ...register, name: e.target.value })
              }
            />
          </Field>
          <ErrorNote error={error} />
          <button className="button primary">Simpan register</button>
        </form>
      </Modal>
      <Modal
        open={dialog === "proof"}
        onOpenChange={() => setDialog("")}
        title="Bukti pembayaran "
        description="Bukti disimpan secara privat. Operator memeriksa pembayaran sebelum mengaktifkan paket."
      >
        <div className="ops-form">
          <div className="ops-review">
            <span>
              {invoice?.id} · {invoice?.plan}
            </span>
            <strong>{money(invoice?.amount || 0)}</strong>
          </div>
          <Field label="File contoh PNG, JPG, atau PDF (maks. 5 MB)">
            <input
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setProof("");
                setError("");
                if (f) {
                  if (
                    f.size > 5_000_000 ||
                    !["image/png", "image/jpeg", "application/pdf"].includes(
                      f.type,
                    )
                  )
                    setError("Gunakan PNG, JPG, atau PDF maksimal 5 MB.");
                  else {
                    try {
                      const form = new FormData();
                      form.set("file", f);
                      const response = await fetch("/api/files", {
                        method: "POST",
                        body: form,
                      });
                      const result = await response.json();
                      if (!response.ok) throw new Error(result.error);
                      setProof(result.id);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }
                }
              }}
            />
          </Field>
          <ErrorNote error={error} />
          <button
            className="button primary"
            disabled={!proof}
            onClick={async () => {
              if (
                !(
                  await commit((s) => {
                    const i = s.invoices.find((x) => x.id === invoiceId)!;
                    i.proof = proof;
                    i.status = "Menunggu verifikasi";
                    i.reason = "";
                    audit(s, `Bukti demo dilampirkan: ${i.id}`);
                  })
                ).ok
              )
                return;
              setDialog("");
              notify("Bukti  menunggu verifikasi operator.");
            }}
          >
            <Upload size={16} /> Kirim untuk verifikasi
          </button>
        </div>
      </Modal>
    </div>
  );
}
