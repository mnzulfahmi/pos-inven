"use client";
import Link from "next/link";
import { useBusiness } from "./business-provider";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Info,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MessageCircle,
  Minus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
  Users,
  XCircle,
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

type PaymentReturn = {
  invoiceId: string;
  phase: "checking" | "pending" | "success" | "expired" | "failed";
  planId?: string;
  amount?: number;
  paymentUrl?: string;
  message: string;
};

function checkoutErrorMessage(code?: string, fallback?: string) {
  if (
    code === "MAYAR_API_KEY_MISSING" ||
    code === "MAYAR_WEBHOOK_SECRET_MISSING" ||
    code === "INSFORGE_API_KEY_MISSING"
  )
    return "Pembayaran Mayar belum aktif. Hubungi administrator untuk menyelesaikan konfigurasi gateway.";
  if (code === "PAYMENT_LINK_EXPIRED")
    return "Tautan pembayaran sebelumnya sudah kedaluwarsa. Klik Bayar dengan Mayar lagi untuk membuat invoice baru.";
  if (code === "OWNER_REQUIRED" || code === "FORBIDDEN")
    return "Hanya Owner / Business Owner yang dapat membeli paket.";
  if (code === "LOGIN_REQUIRED")
    return "Sesi Anda sudah berakhir. Masuk kembali sebelum melanjutkan pembayaran.";
  if (code === "MAYAR_UNAUTHORIZED")
    return "Kredensial pembayaran Mayar tidak valid. Hubungi administrator untuk memperbaiki konfigurasi gateway.";
  if (code === "REQUEST_FAILED")
    return fallback || "Checkout Mayar belum dapat dibuat. Coba lagi.";
  return fallback || "Checkout Mayar belum dapat dibuat. Coba lagi.";
}

export function Pricing() {
  const { state, refresh } = useBusiness();
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
  const [paymentReturn, setPaymentReturn] = useState<PaymentReturn | null>(null);
  const checkoutKeys = useRef(new Map<string, string>());

  // QRIS state
  type PaymentTab = "mayar" | "qris";
  const [paymentTab, setPaymentTab] = useState<PaymentTab>("mayar");
  const [qrisState, setQrisState] = useState<{
    invoiceId: string;
    qrisImageUrl: string;
    amount: number;
    expiresAt: string;
    phase: "idle" | "loading" | "ready" | "checking" | "paid" | "expired" | "error";
    message: string;
  } | null>(null);
  const qrisPolling = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const qrisActive = useRef(false);

  function stopQrisPolling() {
    qrisActive.current = false;
    if (qrisPolling.current) clearTimeout(qrisPolling.current);
  }

  async function startQrisPoll(invoiceId: string, expiresAt: string) {
    qrisActive.current = true;
    let attempts = 0;
    const poll = async () => {
      if (!qrisActive.current) return;
      attempts++;
      try {
        const res = await fetch(
          `/api/billing/qris?invoice=${encodeURIComponent(invoiceId)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!qrisActive.current) return;
        if (["approved", "scheduled"].includes(data.status)) {
          setQrisState((prev) =>
            prev ? { ...prev, phase: "paid", message: "Pembayaran QRIS berhasil dikonfirmasi!" } : prev,
          );
          void refresh();
          return;
        }
        const expired = expiresAt && Date.parse(expiresAt) <= Date.now();
        if (expired) {
          setQrisState((prev) =>
            prev ? { ...prev, phase: "expired", message: "QR Code sudah kedaluwarsa." } : prev,
          );
          return;
        }
        if (attempts < 40) {
          qrisPolling.current = setTimeout(poll, 5000);
        } else {
          setQrisState((prev) =>
            prev
              ? {
                  ...prev,
                  phase: "checking",
                  message: "Sedang menunggu konfirmasi pembayaran…",
                }
              : prev,
          );
        }
      } catch {
        if (qrisActive.current && attempts < 40)
          qrisPolling.current = setTimeout(poll, 8000);
      }
    };
    await poll();
  }

  async function generateQris(event: FormEvent) {
    event.preventDefault();
    if (!review || planNeedsAdjustment(review) || checkoutPending) return;
    setCheckoutPending(true);
    setCheckoutError("");
    stopQrisPolling();
    try {
      const key = checkoutKeys.current.get(review.id + "-qris") || crypto.randomUUID();
      checkoutKeys.current.set(review.id + "-qris", key);
      const res = await fetch("/api/billing/qris", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: `${review.id}-v1`, ...billing, key }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(checkoutErrorMessage(data.code, data.error));
      setQrisState({
        invoiceId: data.invoiceId,
        qrisImageUrl: data.qrisImageUrl,
        amount: data.amount,
        expiresAt: data.expiresAt,
        phase: "ready",
        message: "Scan QR Code di bawah menggunakan aplikasi pembayaran Anda.",
      });
      void startQrisPoll(data.invoiceId, data.expiresAt);
    } catch (error) {
      setCheckoutError((error as Error).message);
    } finally {
      setCheckoutPending(false);
    }
  }
  const askAi = () => {
    if (!pending)
      send("Bantu saya membandingkan paket Starter, Pro, dan Business.");
    window.dispatchEvent(new Event("nusa:open-assistant"));
  };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invoiceId = params.get("invoice");
    if (params.get("billing") !== "return" || !invoiceId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    setPaymentReturn({
      invoiceId,
      phase: "checking",
      message: "Memeriksa pembayaran Mayar…",
    });
    const check = async () => {
      attempts += 1;
      try {
        const response = await fetch(
          `/api/billing/mayar?invoice=${encodeURIComponent(invoiceId)}`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            checkoutErrorMessage(result.code, result.error),
          );
        if (!active) return;
        const expired =
          result.expiresAt && Date.parse(result.expiresAt) <= Date.now();
        if (["approved", "scheduled"].includes(result.status)) {
          setPaymentReturn({
            invoiceId,
            phase: "success",
            planId: result.planId,
            amount: result.amount,
            message:
              result.status === "scheduled"
                ? "Pembayaran diterima. Perubahan paket dijadwalkan pada akhir periode berjalan."
                : "Pembayaran terverifikasi dan paket sudah aktif.",
          });
          void refresh();
          return;
        }
        if (expired) {
          setPaymentReturn({
            invoiceId,
            phase: "expired",
            planId: result.planId,
            amount: result.amount,
            message: "Invoice Mayar sudah kedaluwarsa dan belum dibayar.",
          });
          return;
        }
        if (result.status === "rejected") {
          setPaymentReturn({
            invoiceId,
            phase: "failed",
            planId: result.planId,
            amount: result.amount,
            message: "Pembayaran belum dapat diverifikasi.",
          });
          return;
        }
        setPaymentReturn({
          invoiceId,
          phase: attempts < 10 ? "checking" : "pending",
          planId: result.planId,
          amount: result.amount,
          paymentUrl: result.paymentUrl,
          message:
            attempts < 10
              ? "Pembayaran diterima oleh Mayar dan sedang diverifikasi."
              : "Verifikasi masih berlangsung. Status akan diperbarui otomatis saat webhook Mayar diterima.",
        });
        if (attempts < 10) timer = setTimeout(check, 3000);
      } catch (error) {
        if (!active) return;
        setPaymentReturn({
          invoiceId,
          phase: "failed",
          message: (error as Error).message,
        });
      }
    };
    void check();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  function openCheckout(plan: Plan) {
    setCheckoutError("");
    setPaymentTab("mayar");
    setQrisState(null);
    stopQrisPolling();
    setReview(plan);
  }

  async function selectPlan(event: FormEvent) {
    event.preventDefault();
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
      if (!response.ok) {
        if (result.code === "PAYMENT_LINK_EXPIRED")
          checkoutKeys.current.delete(review.id);
        throw new Error(checkoutErrorMessage(result.code, result.error));
      }
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
      {paymentReturn && (
        <section
          className={`payment-return payment-return-${paymentReturn.phase}`}
          aria-live="polite"
        >
          <span className="payment-return-icon">
            {paymentReturn.phase === "success" ? (
              <CheckCircle2 size={24} />
            ) : paymentReturn.phase === "checking" ? (
              <LoaderCircle className="payment-spin" size={24} />
            ) : paymentReturn.phase === "pending" ? (
              <Clock3 size={24} />
            ) : (
              <XCircle size={24} />
            )}
          </span>
          <div>
            <span>STATUS PEMBAYARAN MAYAR</span>
            <strong>
              {paymentReturn.phase === "success"
                ? "Pembayaran selesai"
                : paymentReturn.phase === "checking"
                  ? "Sedang memverifikasi"
                  : paymentReturn.phase === "pending"
                    ? "Menunggu webhook Mayar"
                    : paymentReturn.phase === "expired"
                      ? "Invoice kedaluwarsa"
                      : "Pembayaran perlu diperiksa"}
            </strong>
            <p>{paymentReturn.message}</p>
            <small>
              Invoice {paymentReturn.invoiceId.slice(0, 8).toUpperCase()}
              {paymentReturn.amount
                ? ` · ${money(paymentReturn.amount)}`
                : ""}
            </small>
          </div>
          <div className="payment-return-actions">
            {paymentReturn.paymentUrl &&
              ["checking", "pending"].includes(paymentReturn.phase) && (
                <a
                  className="button secondary compact"
                  href={paymentReturn.paymentUrl}
                >
                  Lanjutkan pembayaran <ArrowUpRight size={14} />
                </a>
              )}
            {paymentReturn.phase === "success" && (
              <Link className="button secondary compact" href="/settings">
                Lihat invoice <ArrowRight size={14} />
              </Link>
            )}
            {paymentReturn.phase === "pending" && (
              <button
                type="button"
                className="button ghost compact"
                onClick={() => window.location.reload()}
              >
                <RefreshCw size={14} /> Periksa lagi
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label="Tutup status pembayaran"
              onClick={() => {
                setPaymentReturn(null);
                window.history.replaceState({}, "", "/pricing");
              }}
            >
              <XCircle size={18} />
            </button>
          </div>
        </section>
      )}
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
                onClick={() => openCheckout(plan)}
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
                {plans
                  .filter((plan) => plan.id !== "trial")
                  .map((plan) => (
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
        wide
        title={`Tinjau paket ${review?.name ?? ""}`}
        description="Konfirmasi paket dan data pembayar. Pembayaran diselesaikan pada halaman aman Mayar."
        open={!!review}
        onOpenChange={() => {
          if (!checkoutPending) {
            setReview(null);
            stopQrisPolling();
            setQrisState(null);
          }
        }}
      >
        {review && (
          <form
            className="mayar-checkout"
            onSubmit={paymentTab === "qris" ? generateQris : selectPlan}
          >
            <aside className="mayar-order-card">
              <div className="mayar-provider-label">
                <span className="mayar-mark">M</span>
                <span>
                  <strong>Checkout Mayar</strong>
                  <small>Gateway pembayaran Indonesia</small>
                </span>
              </div>
              <div className="mayar-plan-name">
                <span>Paket Nusa</span>
                <strong>{review.name}</strong>
                <small>{review.description}</small>
              </div>
              <div className="mayar-price-total">
                <span>Total pembayaran</span>
                <strong>{money(review.price)}</strong>
                <small>Satu bulan · belum diperpanjang otomatis</small>
              </div>
              <dl className="mayar-order-details">
                <div>
                  <dt>
                    <Store size={14} /> Outlet
                  </dt>
                  <dd>Hingga {review.outlets}</dd>
                </div>
                <div>
                  <dt>
                    <Users size={14} /> Anggota
                  </dt>
                  <dd>Hingga {review.members}</dd>
                </div>
                <div>
                  <dt>
                    <Sparkles size={14} /> Nusa AI
                  </dt>
                  <dd>{number(review.messages)} pesan</dd>
                </div>
              </dl>
              <div className="mayar-current-plan">
                <span>Paket saat ini</span>
                <strong>{state.subscription}</strong>
                <small>
                  {subscription?.period_end
                    ? `Berlaku sampai ${new Date(subscription.period_end).toLocaleDateString("id-ID")}`
                    : "Periode belum tersedia"}
                </small>
              </div>
            </aside>
            <div className="mayar-checkout-main">
              {planNeedsAdjustment(review) ? (
                <div className="plan-capacity-warning">
                  <Info size={20} />
                  <div>
                    <strong>Kapasitas paket belum mencukupi.</strong>
                    <p>
                      Bisnis Anda memiliki {activeOutlets} outlet dan{" "}
                      {activeMembers} anggota aktif. {review.name} mendukung{" "}
                      {review.outlets} outlet dan {review.members} anggota.
                      Nonaktifkan kelebihan outlet atau anggota sebelum membeli
                      paket ini.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Payment method tabs */}
                  <div className="payment-tabs">
                    <button
                      type="button"
                      className={`payment-tab${paymentTab === "mayar" ? " active" : ""}`}
                      onClick={() => {
                        setPaymentTab("mayar");
                        setCheckoutError("");
                        stopQrisPolling();
                        setQrisState(null);
                      }}
                    >
                      <CreditCard size={15} />
                      Bayar via Mayar
                    </button>
                    <button
                      type="button"
                      className={`payment-tab${paymentTab === "qris" ? " active" : ""}`}
                      onClick={() => {
                        setPaymentTab("qris");
                        setCheckoutError("");
                      }}
                    >
                      <QrCode size={15} />
                      QRIS
                    </button>
                  </div>

                  {/* Shared buyer fields */}
                  <div className="mayar-step-heading">
                    <span>1</span>
                    <div>
                      <strong>Identitas pembayar</strong>
                      <p>
                        {paymentTab === "mayar"
                          ? "Mayar menggunakan data ini untuk invoice dan notifikasi pembayaran."
                          : "Data ini digunakan untuk membuat invoice yang terhubung dengan pembayaran QRIS."}
                      </p>
                    </div>
                  </div>
                  <div className="mayar-buyer-fields">
                    <label className="field">
                      <span>
                        <UserRound size={15} /> Nama pembayar
                      </span>
                      <input
                        required
                        minLength={2}
                        maxLength={100}
                        autoComplete="name"
                        placeholder="Nama lengkap"
                        value={billing.name}
                        onChange={(event) =>
                          setBilling({ ...billing, name: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>
                        <Mail size={15} /> Email pembayar
                      </span>
                      <input
                        required
                        type="email"
                        maxLength={254}
                        autoComplete="email"
                        placeholder="nama@email.com"
                        value={billing.email}
                        onChange={(event) =>
                          setBilling({ ...billing, email: event.target.value })
                        }
                      />
                    </label>
                    <label className="field mayar-mobile-field">
                      <span>
                        <MessageCircle size={15} /> Nomor WhatsApp
                      </span>
                      <input
                        required
                        type="tel"
                        minLength={9}
                        maxLength={20}
                        pattern="^\+?[0-9]{9,15}$"
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="0812 3456 7890"
                        value={billing.mobile}
                        onChange={(event) =>
                          setBilling({ ...billing, mobile: event.target.value })
                        }
                      />
                      <small>Gunakan nomor aktif untuk notifikasi Mayar.</small>
                    </label>
                  </div>

                  {/* QRIS panel */}
                  {paymentTab === "qris" && (
                    <div className="qris-panel">
                      {!qrisState && (
                        <div className="qris-intro">
                          <QrCode size={40} />
                          <p>
                            Klik <strong>Tampilkan QR Code</strong> untuk
                            menghasilkan kode QRIS. Scan dengan aplikasi
                            m-banking atau e-wallet Anda.
                          </p>
                          <small>
                            Paket aktif otomatis setelah pembayaran terverifikasi
                            oleh Mayar.
                          </small>
                        </div>
                      )}
                      {qrisState && qrisState.phase !== "idle" && (
                        <div className={`qris-display qris-phase-${qrisState.phase}`}>
                          {(qrisState.phase === "ready" || qrisState.phase === "checking") && (
                            <>
                              <div className="qris-image-wrap">
                                <img
                                  src={qrisState.qrisImageUrl}
                                  alt="QR Code QRIS pembayaran"
                                  width={220}
                                  height={220}
                                />
                                {qrisState.phase === "checking" && (
                                  <div className="qris-checking-overlay">
                                    <LoaderCircle className="payment-spin" size={32} />
                                  </div>
                                )}
                              </div>
                              <div className="qris-info">
                                <span className="qris-amount">{money(qrisState.amount)}</span>
                                <p>{qrisState.message}</p>
                                <small>
                                  Berlaku sampai{" "}
                                  {new Date(qrisState.expiresAt).toLocaleTimeString("id-ID", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </small>
                                <div className="qris-actions">
                                  <LoaderCircle className="payment-spin qris-poll-icon" size={14} />
                                  <span>Menunggu pembayaran…</span>
                                  <button
                                    type="button"
                                    className="button ghost compact"
                                    onClick={() => {
                                      stopQrisPolling();
                                      setQrisState(null);
                                      checkoutKeys.current.delete(review.id + "-qris");
                                    }}
                                  >
                                    Ganti QR
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                          {qrisState.phase === "paid" && (
                            <div className="qris-success">
                              <CheckCircle2 size={40} />
                              <strong>Pembayaran QRIS berhasil!</strong>
                              <p>{qrisState.message}</p>
                              <Link className="button primary compact" href="/settings">
                                Lihat invoice <ArrowRight size={14} />
                              </Link>
                            </div>
                          )}
                          {(qrisState.phase === "expired" || qrisState.phase === "error") && (
                            <div className="qris-expired">
                              <XCircle size={36} />
                              <p>{qrisState.message}</p>
                              <button
                                type="button"
                                className="button secondary compact"
                                onClick={() => {
                                  setQrisState(null);
                                  checkoutKeys.current.delete(review.id + "-qris");
                                }}
                              >
                                <RefreshCw size={14} /> Buat QR baru
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {paymentTab === "mayar" && (
                    <div className="mayar-security-note">
                      <LockKeyhole size={17} />
                      <span>
                        Anda akan diarahkan ke checkout Mayar. Nusa tidak
                        menyimpan PIN, OTP, atau detail metode pembayaran.
                      </span>
                    </div>
                  )}
                </>
              )}
              {checkoutError && (
                <p className="ops-error mayar-checkout-error" role="alert">
                  {checkoutError}
                </p>
              )}
              <div className="mayar-checkout-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setReview(null);
                    stopQrisPolling();
                    setQrisState(null);
                  }}
                  disabled={checkoutPending}
                >
                  Kembali
                </button>
                {paymentTab === "mayar" ? (
                  <button
                    className="button primary"
                    disabled={checkoutPending || planNeedsAdjustment(review)}
                  >
                    {checkoutPending ? (
                      <>
                        <LoaderCircle className="payment-spin" size={16} />
                        Menyiapkan checkout…
                      </>
                    ) : (
                      <>
                        Bayar {money(review.price)}
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                ) : (
                  !qrisState || ["expired", "error"].includes(qrisState.phase) ? (
                    <button
                      className="button primary"
                      disabled={checkoutPending || planNeedsAdjustment(review)}
                    >
                      {checkoutPending ? (
                        <>
                          <LoaderCircle className="payment-spin" size={16} />
                          Membuat QR…
                        </>
                      ) : (
                        <>
                          <QrCode size={16} />
                          Tampilkan QR Code
                        </>
                      )}
                    </button>
                  ) : null
                )}
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
