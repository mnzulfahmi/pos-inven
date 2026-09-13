"use client";
import Link from "next/link";
import { useBusiness } from "./business-provider";
import { useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CreditCard,
  Info,
  Layers3,
  Minus,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
} from "lucide-react";
import { plans, planFaqs, type Plan } from "@/lib/plans";
import { money, number } from "@/lib/demo-data";
import { Modal } from "./ui";
import { useWorkspace } from "./workspace-context";
import { useAiSession } from "./ai-provider";

const featureRows = [
  { name: "Outlet aktif", values: ["1 outlet", "3 outlet", "10 outlet"] },
  {
    name: "Anggota tim aktif",
    values: ["2 anggota", "5 anggota", "20 anggota"],
  },
  {
    name: "Pesan AI per bulan",
    values: ["200 pesan", "1.000 pesan", "5.000 pesan"],
  },
  { name: "Kasir & pencatatan transaksi", values: [true, true, true] },
  { name: "Inventori & pengingat stok", values: [true, true, true] },
  { name: "Laporan penjualan & laba kotor", values: [true, true, true] },
  { name: "AI analisis & draft pembelian", values: [true, true, true] },
  { name: "Hak akses berdasarkan peran", values: [true, true, true] },
  { name: "Perbandingan antaroutlet", values: [false, true, true] },
  { name: "Konsolidasi banyak cabang", values: [false, true, true] },
];
export function Pricing() {
  const { state } = useBusiness();
  const subscription = state.remote?.subscription;
  const aiLimit =
    subscription?.status === "trial" ? 100 : subscription?.plan?.ai_limit || 0;
  const activeOutlets = new Set(
    state.registers.filter((r) => r.active).map((r) => r.outlet),
  ).size;
  const activeMembers = state.members.filter(
    (m) => m.status !== "Nonaktif",
  ).length;
  const planNeedsAdjustment = (p: Plan) =>
    p.outlets < activeOutlets || p.members < activeMembers;
  const { used, notify } = useWorkspace();
  const { send, pending } = useAiSession();
  const [review, setReview] = useState<Plan | null>(null);
  const [billing, setBilling] = useState({
    name: state.settings.name,
    email: "",
    mobile: "",
  });
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const checkoutKeys = useRef(new Map<string, string>());
  const askAi = () => {
    if (!pending)
      send("Bantu saya membandingkan paket Starter, Pro, dan Business.");
    window.dispatchEvent(new Event("nusa:open-assistant"));
  };
  async function selectPlan() {
    if (!review || planNeedsAdjustment(review) || checkoutPending) return;
    setCheckoutPending(true);
    setCheckoutError("");
    try {
      const key = checkoutKeys.current.get(review.id) || crypto.randomUUID();
      checkoutKeys.current.set(review.id, key);
      const response = await fetch("/api/billing/mayar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: `${review.id}-v1`,
          ...billing,
          key,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Gagal membuat pembayaran Mayar.");
      notify("Invoice dibuat. Anda akan diarahkan ke pembayaran Mayar.");
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setCheckoutError((error as Error).message);
      setCheckoutPending(false);
    }
  }
  return (
    <div className="pricing-page page-enter">
      <div className="page-heading">
        <div>
          <div className="greeting">RUANG UNTUK BERTUMBUH</div>
          <h1>
            Paket & langganan<span className="heading-dot">.</span>
          </h1>
          <p>Temukan kapasitas yang pas untuk langkah usaha berikutnya.</p>
        </div>
        <button className="button secondary" onClick={askAi}>
          <Sparkles size={16} />
          Bantu pilih paket
        </button>
      </div>
      <section
        className="subscription-overview"
        aria-label="Langganan saat ini"
      >
        <div className="subscription-current">
          <span className="subscription-icon">
            <Layers3 size={24} />
          </span>
          <div>
            <div className="subscription-name">
              <h2>{state.subscription}</h2>
              <span>
                {state.subscription.startsWith("Trial")
                  ? "TRIAL AKTIF"
                  : "PAKET AKTIF"}
              </span>
            </div>
            <p>Semua ruang untuk mencoba. Tanpa komitmen pembayaran.</p>
            <span className="subscription-date">
              <CalendarDays size={13} />
              Sampai{" "}
              {subscription?.period_end
                ? new Date(subscription.period_end).toLocaleDateString("id-ID")
                : "—"}
            </span>
          </div>
        </div>
        <div className="subscription-usage">
          <div>
            <span>Pesan AI selama trial</span>
            <strong>
              {used}
              <span> / {aiLimit}</span>
            </strong>
          </div>
          <div className="quota-track">
            <span style={{ width: `${used}%` }} />
          </div>
          <p>{Math.max(0, aiLimit - used)} pesan tersisa</p>
        </div>
        <div className="subscription-capacity">
          <span>
            <Store size={15} />
            <strong>
              {activeOutlets} / {subscription?.plan?.outlet_limit || 0}
            </strong>{" "}
            outlet aktif
          </span>
          <span>
            <Users size={15} />
            <strong>
              {activeMembers} / {subscription?.plan?.member_limit || 0}
            </strong>{" "}
            anggota aktif
          </span>
        </div>
      </section>
      <Link
        href="/settings"
        className="button secondary"
        style={{ alignSelf: "flex-start", marginBottom: 20 }}
      >
        Lihat invoice pembayaran <ArrowUpRight size={16} />
      </Link>
      <div className="pricing-intro">
        <div>
          <h2>Satu usaha, banyak kemungkinan.</h2>
          <p>Pilih ruang tumbuh Anda. Semua paket dilengkapi Nusa AI.</p>
        </div>
        <span className="monthly-label">
          <CalendarDays size={14} />
          Langganan bulanan
        </span>
      </div>
      <div className="price-disclaimer">
        <Info size={14} />
        <span>Harga dalam Rupiah dan ditagihkan untuk satu bulan.</span>
      </div>
      <section className="pricing-cards" aria-label="Pilihan paket SaaS">
        {plans.map((plan, index) => {
          const Icon = index === 0 ? Store : index === 1 ? Layers3 : Building2;
          return (
            <article
              key={plan.id}
              className={`pricing-card ${plan.id === "pro" ? "featured" : ""}`}
            >
              <div className="plan-card-top">
                <span className={`plan-icon plan-icon-${plan.id}`}>
                  <Icon size={22} />
                </span>
                {plan.id === "pro" && (
                  <span className="plan-recommendation">
                    <Sparkles size={12} />
                    Untuk berkembang
                  </span>
                )}
              </div>
              <h3>{plan.name}</h3>
              <p className="plan-description">{plan.description}</p>
              <div className="plan-price">
                {money(plan.price)}
                <span>/ bulan</span>
              </div>
              <p className="plan-price-note">
                Pembayaran bulanan melalui Mayar
              </p>
              <button
                className={`button ${plan.id === "pro" ? "primary" : "secondary"} plan-select`}
                onClick={() => setReview(plan)}
              >
                {`Pilih ${plan.name}`}
                <ArrowRight size={16} />
              </button>
              <div className="plan-capacities">
                <div>
                  <Store size={16} />
                  <strong>{plan.outlets} outlet</strong>
                  <span>aktif</span>
                </div>
                <div>
                  <Users size={16} />
                  <strong>{plan.members} anggota</strong>
                  <span>tim</span>
                </div>
                <div>
                  <Sparkles size={16} />
                  <strong>{number(plan.messages)} pesan AI</strong>
                  <span>/ bulan</span>
                </div>
              </div>
              <div className="plan-includes">
                <span>{plan.highlight}</span>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check size={15} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </section>
      <div className="pricing-assurance">
        <span>
          <ShieldCheck size={16} />
          Data tetap milik Anda
        </span>
        <span>
          <CreditCard size={16} />
          Aktivasi setelah verifikasi
        </span>
        <span>
          <Sparkles size={16} />
          AI di setiap paket
        </span>
      </div>
      <section className="panel feature-comparison">
        <div className="panel-heading">
          <div>
            <h2>Lebih jelas, lebih mudah memilih.</h2>
            <p>Bandingkan fitur dan kapasitas setiap paket.</p>
          </div>
          <span className="comparison-label">CAKUPAN PRODUK</span>
        </div>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">
              Perbandingan fitur paket Starter, Pro, dan Business
            </caption>
            <thead>
              <tr>
                <th scope="col">Fitur & kapasitas</th>
                {plans.map((plan) => (
                  <th
                    scope="col"
                    key={plan.id}
                    className={plan.id === "pro" ? "pro-column" : ""}
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureRows.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  {row.values.map((value, i) => (
                    <td key={i} className={i === 1 ? "pro-column" : ""}>
                      {typeof value === "boolean" ? (
                        value ? (
                          <span className="feature-check">
                            <Check size={17} />
                            <span className="sr-only">Termasuk</span>
                          </span>
                        ) : (
                          <span className="feature-unavailable">
                            <Minus size={16} />
                            <span className="sr-only">Tidak termasuk</span>
                          </span>
                        )
                      ) : (
                        value
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="comparison-note">
          <Info size={14} />
          <p>
            Kapasitas paket diterapkan oleh server pada outlet, anggota, dan
            kuota AI di ruang kerja Anda.
          </p>
        </div>
      </section>
      <section className="pricing-faq">
        <div className="faq-intro">
          <span className="faq-eyebrow">SEBELUM MEMILIH</span>
          <h2>
            Ada yang ingin
            <br />
            Anda ketahui?
          </h2>
          <p>Beberapa jawaban untuk membantu menentukan langkah berikutnya.</p>
          <button className="text-button" onClick={askAi}>
            Tanyakan ke Nusa AI <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="faq-list">
          {planFaqs.map((faq) => (
            <details key={faq.question}>
              <summary>
                {faq.question}
                <ChevronDown size={17} />
              </summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
      <footer className="pricing-footer">
        <span>Nusa · Ruang tumbuh usahamu.</span>
        <span>
          Pembayaran diproses oleh Mayar. Paket aktif setelah pembayaran
          terverifikasi.
        </span>
      </footer>
      <Modal
        title={`Tinjau paket ${review?.name ?? ""}`}
        description="Periksa paket dan identitas pembayar sebelum melanjutkan ke checkout Mayar."
        open={!!review}
        onOpenChange={() => {
          if (!checkoutPending) setReview(null);
        }}
      >
        {review && (
          <>
            <div className="plan-review-summary">
              <span>
                {review.name}
                <small>Langganan bulanan</small>
              </span>
              <strong>
                {money(review.price)}
                <small>Ditagihkan / bulan</small>
              </strong>
            </div>
            <div className="detail-list">
              <div>
                <span>Outlet aktif</span>
                <strong>Hingga {review.outlets} outlet</strong>
              </div>
              <div>
                <span>Anggota aktif</span>
                <strong>Hingga {review.members} anggota</strong>
              </div>
              <div>
                <span>Kuota AI</span>
                <strong>{number(review.messages)} pesan / bulan</strong>
              </div>
              <div>
                <span>Paket saat ini</span>
                <strong>Trial Pro · sampai 14 Sep 2026</strong>
              </div>
            </div>
            {planNeedsAdjustment(review) && (
              <div className="plan-capacity-warning">
                <Info size={18} />
                <div>
                  <strong>Sesuaikan kapasitas sebelum pindah.</strong>
                  <p>
                    Bisnis Anda memiliki {activeOutlets} outlet dan{" "}
                    {activeMembers} anggota aktif. {review.name} mendukung{" "}
                    {review.outlets} outlet dan {review.members} anggota.
                    Perubahan ditunda sampai batas terpenuhi; data tidak
                    dihapus.
                  </p>
                </div>
              </div>
            )}
            <div className="info-note">
              <ShieldCheck size={17} />
              <span>
                {planNeedsAdjustment(review)
                  ? "Pilihan akan ditandai perlu penyesuaian. "
                  : "Checkout dilanjutkan melalui Mayar. "}
                Paket aktif berubah setelah pembayaran diverifikasi. Downgrade
                dijadwalkan pada akhir periode berjalan.
              </span>
            </div>
            {!planNeedsAdjustment(review) && (
              <div className="ops-form">
                <label className="field">
                  Nama pembayar
                  <input
                    required
                    autoComplete="name"
                    value={billing.name}
                    onChange={(event) =>
                      setBilling({ ...billing, name: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Email pembayar
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={billing.email}
                    onChange={(event) =>
                      setBilling({ ...billing, email: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Nomor WhatsApp
                  <input
                    required
                    type="tel"
                    autoComplete="tel"
                    placeholder="081234567890"
                    value={billing.mobile}
                    onChange={(event) =>
                      setBilling({ ...billing, mobile: event.target.value })
                    }
                  />
                </label>
              </div>
            )}
            {checkoutError && (
              <p className="ops-error" role="alert">
                {checkoutError}
              </p>
            )}
            <div className="dialog-actions">
              <button
                className="button secondary"
                onClick={() => setReview(null)}
                disabled={checkoutPending}
              >
                Batal
              </button>
              <button
                className="button primary"
                onClick={selectPlan}
                disabled={
                  checkoutPending ||
                  planNeedsAdjustment(review) ||
                  !billing.name.trim() ||
                  !billing.email.trim() ||
                  !billing.mobile.trim()
                }
              >
                <CreditCard size={16} />
                {checkoutPending ? "Membuat invoice…" : "Bayar dengan Mayar"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
