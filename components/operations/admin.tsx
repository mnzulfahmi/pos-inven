"use client";
import { useState } from "react";
import { ShieldCheck, Check, X, FileCheck2 } from "lucide-react";
import { useBusiness } from "../business-provider";
import { useWorkspace } from "../workspace-context";
import { Modal } from "../ui";
import { money } from "@/lib/demo-data";
import { audit } from "@/lib/operations";
import { plans } from "@/lib/plans";
import {
  PageHeading,
  DemoNote,
  Tabs,
  Field,
  ErrorNote,
  Badge,
  Empty,
  Stats,
  FlowLink,
} from "./shared";
export function AdminPage() {
  const { state, commit } = useBusiness();
  const { notify } = useWorkspace();
  const [tab, setTab] = useState("Verifikasi invoice"),
    [selected, setSelected] = useState(""),
    [action, setAction] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const invoice = state.invoices.find((i) => i.id === selected);
  const pending = state.invoices.filter(
    (i) => i.status === "Menunggu verifikasi",
  );
  async function confirm() {
    const r = await commit((s) => {
      if (!reason.trim()) throw new Error("Catatan operator wajib diisi.");
      if (action === "tenant") {
        s.tenantStatus = s.tenantStatus === "Aktif" ? "Ditangguhkan" : "Aktif";
        audit(s, `Operator: tenant ${s.tenantStatus}. ${reason}`);
        return;
      }
      const i = s.invoices.find((i) => i.id === selected);
      if (!i || i.status !== "Menunggu verifikasi")
        throw new Error("Invoice tidak lagi menunggu verifikasi.");
      if (action === "approve") {
        const plan = plans.find((p) => p.name === i.plan);
        if (!plan) throw new Error("Paket tidak ditemukan.");
        const outletCount = new Set(
            s.registers.filter((r) => r.active).map((r) => r.outlet),
          ).size,
          memberCount = s.members.filter((m) => m.status !== "Nonaktif").length;
        if (outletCount > plan.outlets || memberCount > plan.members)
          throw new Error(
            `Kapasitas melebihi paket ${plan.name}. Sesuaikan outlet/anggota terlebih dahulu.`,
          );
        i.status = "Disetujui";
        s.subscription = `${i.plan} · aktif (demo)`;
      } else i.status = "Ditolak";
      i.reason = reason;
      audit(s, `Operator: ${i.id} ${i.status}. ${reason}`);
    });
    if (!r.ok) setError(r.error);
    else {
      setAction("");
      notify("Keputusan operator demo dicatat.");
    }
  }
  return (
    <div className="ops-page">
      <PageHeading
        eyebrow="PLATFORM OPERATIONS · DEMO"
        title="Konsol operator"
        description="Tinjau invoice, status tenant, dan jejak aktivitas platform."
      >
        <FlowLink href="/settings">Kembali ke workspace</FlowLink>
      </PageHeading>
      <div className="ops-operator-banner">
        <ShieldCheck size={21} />
        <div>
          <strong>Pratinjau peran operator platform</strong>
          <p>
            Area ini menyimulasikan alur admin terpisah. Autentikasi dan
            pembatasan akses belum diimplementasikan.
          </p>
        </div>
      </div>
      <DemoNote />
      <Stats
        items={[
          { label: "Tenant demo", value: 1, hint: state.settings.name },
          {
            label: "Menunggu verifikasi",
            value: pending.length,
            hint: "Bukti demo sudah dilampirkan",
          },
          {
            label: "Invoice disetujui",
            value: state.invoices.filter((i) => i.status === "Disetujui")
              .length,
            hint: "Status lokal, tanpa penagihan nyata",
          },
        ]}
      />
      <Tabs
        items={["Verifikasi invoice", "Tenant", "Audit log"]}
        value={tab}
        onChange={setTab}
      />
      <section className="panel">
        {tab === "Verifikasi invoice" ? (
          <>
            <div className="ops-toolbar">
              <h2>
                <FileCheck2 size={20} /> Antrean & riwayat invoice
              </h2>
              <Badge>{pending.length} perlu ditinjau</Badge>
            </div>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Invoice / tenant</th>
                    <th>Paket</th>
                    <th>Nilai</th>
                    <th>Bukti</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {state.invoices.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <strong>{i.id}</strong>
                        <small>{state.settings.name}</small>
                      </td>
                      <td>{i.plan}</td>
                      <td>{money(i.amount)}</td>
                      <td>{i.proof || "Belum dilampirkan"}</td>
                      <td>
                        <Badge>{i.status}</Badge>
                        <small>{i.reason}</small>
                      </td>
                      <td>
                        {i.status === "Menunggu verifikasi" && (
                          <div className="ops-inline-actions">
                            <button
                              className="text-button"
                              onClick={() => {
                                setSelected(i.id);
                                setAction("approve");
                                setReason("");
                                setError("");
                              }}
                            >
                              Tinjau
                            </button>
                            <button
                              className="text-button"
                              onClick={() => {
                                setSelected(i.id);
                                setAction("reject");
                                setReason("");
                                setError("");
                              }}
                            >
                              Tolak
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!state.invoices.length && (
              <Empty>
                Belum ada invoice. Pilih paket dan lampirkan bukti demo melalui
                Pengaturan → Langganan.
              </Empty>
            )}
          </>
        ) : tab === "Tenant" ? (
          <div className="ops-section">
            <div className="ops-keyvalue">
              <div>
                <h2>{state.settings.name}</h2>
                <p>Owner: andi@example.test · tenant_nusantara_demo</p>
              </div>
              <Badge>{state.tenantStatus}</Badge>
            </div>
            <div className="ops-keyvalue">
              <span>Langganan</span>
              <b>{state.subscription}</b>
            </div>
            <div className="ops-keyvalue">
              <span>Outlet aktif</span>
              <b>
                {
                  new Set(
                    state.registers
                      .filter((r) => r.active)
                      .map((r) => r.outlet),
                  ).size
                }
              </b>
            </div>
            <p className="info-note">
              Penangguhan demo memblokir checkout baru. Data tetap dapat dibaca;
              kontrol akses produksi membutuhkan backend.
            </p>
            <button
              className="button secondary"
              onClick={() => {
                setAction("tenant");
                setReason("");
                setError("");
              }}
            >
              {state.tenantStatus === "Aktif"
                ? "Tangguhkan tenant demo"
                : "Aktifkan tenant demo"}
            </button>
          </div>
        ) : (
          <div className="ops-section">
            <h2>Jejak aktivitas sesi</h2>
            {state.audit.map((a, i) => (
              <div className="ops-audit-row" key={a.id}>
                <span>{state.audit.length - i}</span>
                <div>
                  <strong>{a.action}</strong>
                  <small>{a.id} · 11 Sep 2026 · sesi demo</small>
                </div>
              </div>
            ))}
            {!state.audit.length && (
              <Empty>
                Belum ada aktivitas. Tindakan operasional akan dicatat di sini.
              </Empty>
            )}
          </div>
        )}
      </section>
      <Modal
        open={!!action}
        onOpenChange={() => setAction("")}
        title={
          action === "tenant"
            ? "Ubah status tenant demo"
            : action === "approve"
              ? "Verifikasi invoice demo"
              : "Tolak invoice demo"
        }
        description="Keputusan hanya memperbarui state lokal. Tidak ada pembayaran, aktivasi akun nyata, atau akses ke isi file bukti."
      >
        <div className="ops-form">
          {invoice && action !== "tenant" && (
            <div className="ops-review">
              <span>
                {invoice.id}
                <small>{invoice.proof}</small>
              </span>
              <strong>{money(invoice.amount)}</strong>
            </div>
          )}
          <Field label="Catatan / alasan keputusan">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <ErrorNote error={error} />
          <button
            className="button primary"
            disabled={!reason.trim()}
            onClick={confirm}
          >
            {action === "reject" ? <X size={17} /> : <Check size={17} />}{" "}
            Konfirmasi keputusan demo
          </button>
        </div>
      </Modal>
    </div>
  );
}
