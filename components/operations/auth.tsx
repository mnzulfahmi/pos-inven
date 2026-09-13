"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Store,
  Sparkles,
  BarChart3,
  MailCheck,
  Package,
} from "lucide-react";
import { Logo } from "../ui";
import { useBusiness } from "../business-provider";
import { useWorkspace } from "../workspace-context";
import {
  stockCount,
  balance,
  uid,
  audit,
  type StoreId,
} from "@/lib/operations";
import {
  Field,
  NumericInput,
  ErrorNote,
  StoreSelect,
  FlowLink,
} from "./shared";
export function AuthPage({
  mode,
}: {
  mode: "login" | "register" | "verify-email" | "forgot-password";
}) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const isRegister = mode === "register";
  return (
    <div className="ops-auth">
      <section className="ops-auth-story">
        <Logo />
        <div>
          <span className="ops-auth-pill">SATU RUANG UNTUK USAHA ANDA</span>
          <h1>
            Usaha tertata.
            <br />
            Peluang terbuka<span>.</span>
          </h1>
          <p>
            Dari transaksi pertama hingga cabang berikutnya, Nusa menemani usaha
            Anda tumbuh.
          </p>
          <div className="ops-auth-illustration">
            <div className="ops-auth-visual-card">
              <Store size={26} />
              <span>
                Toko Nusantara<small>Ringkasan usaha hari ini</small>
              </span>
              <CheckCircle2 size={18} />
            </div>
            <div className="ops-auth-bars">
              {[35, 52, 44, 68, 58, 83, 100].map((h, i) => (
                <span key={i} style={{ height: h + "%" }} />
              ))}
            </div>
            <div className="ops-auth-visual-card">
              <Sparkles size={25} />
              <span>
                Lebih siap untuk besok
                <small>Wawasan yang mudah ditindaklanjuti</small>
              </span>
            </div>
          </div>
        </div>
        <p className="ops-auth-footer">
          Dirancang untuk ritme usaha Indonesia.
        </p>
      </section>
      <section className="ops-auth-form">
        <Link href="/dashboard" className="ops-auth-back">
          Jelajahi demo <ArrowRight size={15} />
        </Link>
        <div>
          <span className="ops-eyebrow">SELAMAT DATANG DI NUSA</span>
          <h2>
            {isRegister
              ? "Mulai cerita usaha Anda"
              : mode === "login"
                ? "Senang bertemu kembali"
                : mode === "verify-email"
                  ? "Verifikasi email Anda"
                  : "Atur ulang kata sandi"}
          </h2>
          <p>
            {isRegister
              ? "Coba alur pendaftaran dan Trial Pro 14 hari."
              : mode === "login"
                ? "Masuk ke ruang kerja contoh untuk melanjutkan."
                : mode === "verify-email"
                  ? "Langkah terakhir sebelum menyiapkan ruang kerja."
                  : "Simulasikan permintaan pemulihan akun."}
          </p>
          {mode === "verify-email" ? (
            <div className="ops-form">
              <div className="ops-auth-mail">
                <MailCheck size={44} />
              </div>
              <p>
                Di aplikasi produksi, tautan verifikasi dikirim melalui email.
                Gunakan tombol berikut untuk menyelesaikan langkah ini dalam
                demo.
              </p>
              <button
                className="button primary full"
                onClick={() => router.push("/onboarding")}
              >
                Simulasikan email terverifikasi <ArrowRight size={17} />
              </button>
              <button
                className="button secondary full"
                onClick={() => setSent(true)}
              >
                {sent
                  ? "Pengiriman ulang disimulasikan"
                  : "Simulasikan kirim ulang tautan"}
              </button>
            </div>
          ) : mode === "forgot-password" && sent ? (
            <div className="ops-form">
              <MailCheck size={36} />
              <h3>Permintaan demo dicatat</h3>
              <p>
                Tidak ada email yang dikirim. Kembali ke halaman masuk untuk
                melanjutkan simulasi.
              </p>
              <FlowLink href="/login">Kembali masuk</FlowLink>
            </div>
          ) : (
            <form
              className="ops-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (mode === "forgot-password") setSent(true);
                else router.push(isRegister ? "/verify-email" : "/dashboard");
              }}
            >
              {isRegister && (
                <Field label="Nama lengkap">
                  <input
                    required
                    name="demo-name"
                    autoComplete="name"
                    placeholder="Andi Pratama"
                  />
                </Field>
              )}
              <Field label="Email contoh">
                <input
                  required
                  type="email"
                  autoComplete="email"
                  defaultValue="andi@example.test"
                />
              </Field>
              {mode !== "forgot-password" && (
                <Field label="Kata sandi contoh">
                  <input
                    required
                    type="password"
                    minLength={8}
                    autoComplete={
                      isRegister ? "new-password" : "current-password"
                    }
                    placeholder="Minimal 8 karakter"
                    defaultValue="demo-nusa-2026"
                  />
                </Field>
              )}
              {mode === "login" && (
                <Link href="/forgot-password" className="ops-auth-forgot">
                  Lupa kata sandi?
                </Link>
              )}
              <button className="button primary full">
                {isRegister
                  ? "Buat ruang kerja demo"
                  : mode === "login"
                    ? "Masuk ke demo"
                    : "Simulasikan kirim tautan"}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          <p className="ops-auth-switch">
            {isRegister ? "Sudah punya akun?" : "Belum punya akun?"}{" "}
            <Link href={isRegister ? "/login" : "/register"}>
              {isRegister ? "Masuk" : "Mulai sekarang"}
            </Link>
          </p>
          <div className="ops-auth-disclaimer">
            Prototipe frontend · Gunakan identitas contoh. Formulir tidak
            membuat akun, menyimpan kata sandi, atau mengirim email.
          </div>
        </div>
        <small>© 2026 Nusa · Ruang tumbuh usahamu</small>
      </section>
    </div>
  );
}
export function OnboardingPage() {
  const { state, commit } = useBusiness();
  const { setOutlet } = useWorkspace();
  const router = useRouter();
  const [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [name, setName] = useState(state.settings.name),
    [address, setAddress] = useState(state.settings.address),
    [store, setStore] = useState<StoreId>("dago"),
    [register, setRegister] = useState("Kasir 01"),
    [physical, setPhysical] = useState<Record<string, number>>({});
  const steps = [
    "Profil usaha",
    "Outlet & kasir",
    "Katalog & stok",
    "Siap berjualan",
  ];
  async function next() {
    setError("");
    const r = await commit((s) => {
      if (step === 0) {
        if (!name.trim()) throw new Error("Nama usaha wajib diisi.");
        s.settings.name = name;
        s.settings.address = address;
      }
      if (step === 1) {
        if (!register.trim()) throw new Error("Nama register wajib diisi.");
        if (!s.registers.some((r) => r.outlet === store && r.name === register))
          s.registers.push({
            id: uid("REG"),
            outlet: store,
            name: register,
            active: true,
          });
      }
      if (step === 2) {
        stockCount(
          s,
          store,
          s.products
            .filter((p) => !p.archived)
            .map((p) => ({
              productId: p.id,
              physical: physical[p.id] ?? balance(s, store, p.id).stock,
              version: balance(s, store, p.id).version,
            })),
          "Saldo awal onboarding demo",
        );
        s.onboarded = true;
        audit(s, "Onboarding demo selesai");
      }
    });
    if (!r.ok) setError(r.error);
    else setStep(step + 1);
  }
  return (
    <div className="ops-onboarding">
      <div className="ops-onboarding-top">
        <Logo />
        <Link href="/dashboard">Lanjutkan nanti →</Link>
      </div>
      <div className="ops-onboarding-heading">
        <span className="ops-eyebrow">MULAI DENGAN LANGKAH KECIL</span>
        <h1>
          Siapkan ruang tumbuh Anda<span>.</span>
        </h1>
        <p>Empat langkah sederhana menuju transaksi pertama.</p>
      </div>
      <ol className="ops-steps">
        {steps.map((s, i) => (
          <li
            key={s}
            className={i === step ? "current" : i < step ? "done" : ""}
          >
            <span>{i < step ? <CheckCircle2 size={18} /> : i + 1}</span>
            <b>{s}</b>
          </li>
        ))}
      </ol>
      <section className="panel ops-onboarding-card">
        {step === 0 ? (
          <>
            <span className="ops-mini-icon">
              <Store size={26} />
            </span>
            <h2>Ceritakan tentang usaha Anda</h2>
            <p>Nama dan alamat ini akan digunakan pada struk.</p>
            <div className="ops-form">
              <Field label="Nama usaha">
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Alamat usaha">
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </Field>
            </div>
          </>
        ) : step === 1 ? (
          <>
            <h2>Di mana transaksi pertama dimulai?</h2>
            <p>Pilih satu dari outlet contoh dan siapkan register kasir.</p>
            <div className="ops-form">
              <Field label="Outlet">
                <StoreSelect
                  value={store}
                  onChange={(v) => {
                    setStore(v);
                    setPhysical({});
                  }}
                />
              </Field>
              <Field label="Nama register">
                <input
                  value={register}
                  onChange={(e) => setRegister(e.target.value)}
                />
              </Field>
            </div>
          </>
        ) : step === 2 ? (
          <>
            <span className="ops-mini-icon">
              <Package size={26} />
            </span>
            <h2>Katalog sudah disiapkan untuk Anda</h2>
            <p>
              Gunakan lima produk contoh dan konfirmasi jumlah fisik sebagai
              saldo awal. Produk dan impor CSV dapat dikelola melalui Inventori.
            </p>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>SKU</th>
                    <th>Saldo awal</th>
                  </tr>
                </thead>
                <tbody>
                  {state.products
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{p.sku}</td>
                        <td>
                          <NumericInput
                            aria-label={`Saldo awal ${p.name}`}
                            min="0"
                            value={
                              physical[p.id] ??
                              balance(state, store, p.id).stock
                            }
                            onValueChange={(value) =>
                              setPhysical({
                                ...physical,
                                [p.id]: value,
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="info-note">
              Langkah berikutnya mengonfirmasi saldo di atas sebagai opname
              demo.
            </p>
          </>
        ) : (
          <div className="ops-onboarding-success">
            <CheckCircle2 size={58} />
            <h2>Ruang kerja Anda siap!</h2>
            <p>
              Buka shift, masukkan modal kas, lalu buat penjualan pertama. Trial
              Pro contoh memiliki 100 pesan AI selama 14 hari.
            </p>
            <button
              className="button primary"
              onClick={() => {
                setOutlet(store);
                router.push("/pos");
              }}
            >
              Buka kasir & mulai shift <ArrowRight size={17} />
            </button>
            <div className="ops-onboarding-links">
              <FlowLink href="/settings">Atur anggota tim</FlowLink>
              <FlowLink href="/dashboard">Lihat dashboard</FlowLink>
            </div>
          </div>
        )}
        <ErrorNote error={error} />
        {step < 3 && (
          <div className="dialog-actions">
            {step > 0 && (
              <button
                className="button secondary"
                onClick={() => setStep(step - 1)}
              >
                Kembali
              </button>
            )}
            <button className="button primary" onClick={next}>
              {step === 2 ? "Konfirmasi & selesaikan" : "Simpan & lanjutkan"}
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>
      <p className="ops-caption">
        Demo dengan data contoh · Tidak ada akun atau layanan backend yang
        dibuat.
      </p>
    </div>
  );
}
