"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Store, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { Logo } from "./ui";
import { Field, ErrorNote } from "./operations/shared";
import { useBusiness } from "./business-provider";
import { api } from "@/lib/backend-state";
export function AuthPage({
  mode,
}: {
  mode: "login" | "register" | "verify-email" | "forgot-password";
}) {
  const router = useRouter();
  const { refresh } = useBusiness();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false),
    [email, setEmail] = useState("");
  useEffect(
    () => setEmail(sessionStorage.getItem("nusa_auth_email") || ""),
    [],
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const op = mode === "forgot-password" && sent ? "reset-password" : mode;
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op,
          email,
          password: f.get("password"),
          name: f.get("name"),
          code: f.get("code"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      sessionStorage.setItem("nusa_auth_email", email);
      if (mode === "register") router.push("/verify-email");
      else if (mode === "forgot-password") {
        if (sent) router.push("/login");
        else setSent(true);
      } else {
        await refresh();
        router.push("/dashboard");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
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
                Satu ruang kerja<small>Penjualan, persediaan, dan tim</small>
              </span>
              <CheckCircle2 />
            </div>
            <div className="ops-auth-bars">
              {[35, 52, 44, 68, 58, 83, 100].map((h, i) => (
                <span key={i} style={{ height: h + "%" }} />
              ))}
            </div>
            <div className="ops-auth-visual-card">
              <Sparkles />
              <span>Lebih siap untuk besok</span>
            </div>
          </div>
        </div>
        <p>Dirancang untuk ritme usaha Indonesia.</p>
      </section>
      <section className="ops-auth-form">
        <div>
          <span className="ops-eyebrow">SELAMAT DATANG DI NUSA</span>
          <h2>
            {mode === "login"
              ? "Senang bertemu kembali"
              : mode === "register"
                ? "Mulai cerita usaha Anda"
                : mode === "verify-email"
                  ? "Verifikasi email Anda"
                  : "Atur ulang kata sandi"}
          </h2>
          <p>
            {mode === "verify-email"
              ? "Masukkan kode yang dikirim ke email Anda."
              : sent
                ? "Masukkan kode pemulihan dari email dan kata sandi baru."
                : "Masuk ke ruang kerja usaha Anda."}
          </p>
          <form className="ops-form" onSubmit={submit}>
            {mode === "register" && (
              <Field label="Nama lengkap">
                <input name="name" required autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            {(mode === "verify-email" || sent) && (
              <Field label="Kode email">
                <input
                  name="code"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </Field>
            )}
            {(mode === "login" || mode === "register" || sent) && (
              <Field label="Kata sandi">
                <input
                  type="password"
                  name="password"
                  required
                  minLength={mode === "login" ? 1 : 8}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
              </Field>
            )}
            <ErrorNote error={error} />
            <button className="button primary full" disabled={busy}>
              {busy
                ? "Memproses…"
                : mode === "login"
                  ? "Masuk"
                  : mode === "register"
                    ? "Daftar"
                    : mode === "verify-email"
                      ? "Verifikasi"
                      : sent
                        ? "Simpan kata sandi"
                        : "Kirim kode pemulihan"}
              <ArrowRight size={16} />
            </button>
          </form>
          {mode === "verify-email" && (
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ op: "resend", email }),
                  });
                  const d = await r.json();
                  setError(r.ok ? "Kode baru dikirim." : d.error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Kirim ulang kode
            </button>
          )}
          <p className="ops-auth-switch">
            <Link href="/login">Masuk</Link> ·{" "}
            <Link href="/register">Daftar</Link> ·{" "}
            <Link href="/forgot-password">Lupa kata sandi?</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
export function OnboardingPage() {
  const { state, refresh } = useBusiness();
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="ops-onboarding">
      <Logo />
      <div className="ops-onboarding-heading">
        <span className="ops-eyebrow">MULAI DENGAN LANGKAH KECIL</span>
        <h1>
          Siapkan ruang tumbuh Anda<span>.</span>
        </h1>
      </div>
      <section className="panel ops-onboarding-card">
        <form
          className="ops-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              if (!state.remote?.tenant)
                await api("onboard", {
                  name: f.get("name"),
                  address: f.get("address"),
                  outletName: f.get("outletName"),
                  registerName: f.get("registerName"),
                });
              await api("finish-onboarding");
              await refresh();
              router.push("/inventory");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Profil usaha dan outlet pertama</h2>
          <p>
            Setelah ruang kerja siap, tambahkan produk dan catat saldo stok awal
            melalui Inventori. Trial Pro 14 hari dimulai saat Anda menyelesaikan
            langkah ini.
          </p>
          {!state.remote?.tenant && (
            <>
              <Field label="Nama usaha">
                <input name="name" required maxLength={160} />
              </Field>
              <Field label="Alamat">
                <textarea name="address" />
              </Field>
              <Field label="Nama outlet pertama">
                <input name="outletName" required maxLength={160} />
              </Field>
              <Field label="Register kasir">
                <input name="registerName" required defaultValue="Kasir 01" />
              </Field>
            </>
          )}
          <ErrorNote error={error} />
          <button className="button primary" disabled={busy}>
            {busy ? "Menyiapkan…" : "Simpan & lanjutkan ke katalog"}
            <ArrowRight size={16} />
          </button>
        </form>
      </section>
    </div>
  );
}
export function InvitePage() {
  const { session, refresh } = useBusiness();
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="ops-onboarding">
      <Logo />
      <section className="panel ops-onboarding-card">
        <h1>Bergabung dengan tim</h1>
        <p>
          Masuk menggunakan alamat email yang menerima undangan, lalu terima
          undangan ini.
        </p>
        <ErrorNote error={error} />
        {!session ? (
          <Link href="/login">
            Masuk atau daftar, lalu buka kembali tautan undangan
          </Link>
        ) : (
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("accept-invite", {
                  token: new URLSearchParams(location.search).get("token"),
                });
                await refresh();
                router.push("/dashboard");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Terima undangan
          </button>
        )}
      </section>
    </div>
  );
}
