"use client";
import { useState, useEffect } from "react";
import { useBusiness } from "./business-provider";
import { api } from "@/lib/backend-state";
import { money, outletName } from "@/lib/demo-data";
import { Field, ErrorNote, PageHeading } from "./operations/shared";
export function OutletPanel() {
  const { state, refresh } = useBusiness();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (state.remote?.role !== "owner") return null;
  return (
    <section className="panel" style={{ margin: "24px", padding: 24 }}>
      <h2>Kelola outlet</h2>
      <p>
        Kapasitas mengikuti paket aktif. Outlet dengan shift terbuka atau
        pesanan berjalan tidak dapat dinonaktifkan.
      </p>
      <div className="ops-table-wrap">
        <table className="ops-table">
          <tbody>
            {state.remote.outlets?.map((o: any) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td>{o.active ? "Aktif" : "Nonaktif"}</td>
                <td>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api("save-outlet", {
                          id: o.id,
                          name: o.name,
                          code: o.code,
                          address: o.address,
                          active: !o.active,
                        });
                        await refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {o.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="ops-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const form = e.currentTarget,
            f = new FormData(form);
          try {
            await api("save-outlet", {
              name: f.get("name"),
              address: f.get("address"),
            });
            form.reset();
            await refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Nama outlet baru">
          <input name="name" required maxLength={160} />
        </Field>
        <Field label="Alamat">
          <input name="address" />
        </Field>
        <ErrorNote error={error} />
        <button className="button secondary" disabled={busy}>
          Tambah outlet
        </button>
      </form>
    </section>
  );
}
export function ApprovalPanel({ kind }: { kind: "counts" | "refunds" }) {
  const { state, refresh } = useBusiness();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!["owner", "manager"].includes(state.remote?.role)) return null;
  const rows = (state.remote?.[kind] || []).filter(
    (a: any) => a.status === "pending",
  );
  if (!rows.length) return null;
  return (
    <section className="panel approval-panel">
      <div className="approval-panel-heading">
        <div>
          <span>PERLU TINDAKAN</span>
          <h2>
            {kind === "counts" ? "Opname" : "Refund"} menunggu persetujuan
          </h2>
        </div>
        <strong>{rows.length} menunggu</strong>
      </div>
      <div className="approval-list">
        {rows.map((a: any) => (
          <article className="approval-card" key={a.id}>
            <div className="approval-card-content">
              <div className="approval-card-summary">
                <strong>{outletName(a.outlet_id)}</strong>
                <p>{a.reason}</p>
              </div>
              <div className="approval-card-lines">
                {kind === "counts" &&
                  a.lines?.map((l: any, index: number) => (
                    <div key={l.id || `${a.id}-${index}`}>
                      <span>
                        {state.products.find((p) => p.id === l.variant_id)
                          ?.name || "Produk"}
                      </span>
                      <strong>
                        {l.expected} → {l.physical}
                      </strong>
                      <small>Sistem → fisik</small>
                    </div>
                  ))}
                {kind === "refunds" &&
                  a.lines?.map((l: any, index: number) => (
                    <div key={l.id || `${a.id}-${index}`}>
                      <span>{l.name}</span>
                      <strong>{money(Number(l.net) + Number(l.tax))}</strong>
                      <small>
                        {l.quantity} unit · layak jual {l.restock}
                      </small>
                    </div>
                  ))}
              </div>
            </div>
            <div className="approval-card-actions">
              <p>
                {kind === "refunds"
                  ? "Periksa barang, jumlah, dan pengembalian pembayaran sebelum menyetujui."
                  : "Periksa hitungan fisik sebelum mencatat selisih pada buku stok."}
              </p>
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(
                      kind === "counts" ? "approve-count" : "approve-refund",
                      {
                        id: a.id,
                        shiftId: state.shifts.find(
                          (s) => s.outlet === a.outlet_id && !s.closed,
                        )?.id,
                        manualConfirmed: true,
                      },
                    );
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Konfirmasi & setujui
              </button>
            </div>
          </article>
        ))}
      </div>
      <ErrorNote error={error} />
    </section>
  );
}
export function OperatorPage() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const r = await fetch("/api/operator");
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  async function action(t: string, op: string, p: any) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/operator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t, op, p, k: crypto.randomUUID() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ops-page">
      <PageHeading
        title="Konsol operator"
        eyebrow="PLATFORM"
        description="Verifikasi pembayaran dan kelola status tenant sesuai kewenangan operator."
      />
      <ErrorNote error={error} />
      {data && (
        <>
          <section className="panel" style={{ padding: 24 }}>
            <h2>Invoice menunggu verifikasi</h2>
            {!data.invoices.length && <p>Tidak ada invoice menunggu.</p>}
            {data.invoices.map((i: any) => (
              <form
                className="ops-form"
                key={i.id}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await action(i.tenant_id, "verify-invoice", {
                    id: i.id,
                    decision: f.get("decision"),
                    reason: f.get("reason"),
                  });
                }}
              >
                <strong>
                  {data.tenants.find((t: any) => t.id === i.tenant_id)?.name} ·{" "}
                  {i.plan_id} · {money(i.amount)}
                </strong>
                <span>{i.status}</span>
                {i.proof_file_id && (
                  <a
                    className="text-button"
                    href={"/api/files/" + i.proof_file_id}
                  >
                    Unduh bukti pembayaran
                  </a>
                )}
                <Field label="Keputusan">
                  <select name="decision">
                    <option value="approve">Setujui pembayaran</option>
                    <option value="reject">Tolak bukti</option>
                  </select>
                </Field>
                <Field label="Catatan verifikasi">
                  <input name="reason" required />
                </Field>
                <button
                  className="button primary"
                  disabled={busy || i.status !== "pending"}
                >
                  Konfirmasi keputusan
                </button>
              </form>
            ))}
          </section>
          <section className="panel" style={{ padding: 24, marginTop: 24 }}>
            <h2>Status tenant</h2>
            {data.tenants.map((t: any) => (
              <form
                key={t.id}
                className="ops-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await action(t.id, "tenant-status", {
                    status: t.status === "active" ? "suspended" : "active",
                    reason: f.get("reason"),
                  });
                }}
              >
                <strong>
                  {t.name} · {t.status}
                </strong>
                <Field label="Alasan perubahan">
                  <input name="reason" required />
                </Field>
                <button className="button secondary" disabled={busy}>
                  {t.status === "active" ? "Tangguhkan" : "Aktifkan"}
                </button>
              </form>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
