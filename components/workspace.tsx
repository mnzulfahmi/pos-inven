"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ArrowUpRight,
  Bell,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CreditCard,
  LayoutDashboard,
  Menu,
  Package,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  X,
  Settings,
} from "lucide-react";
import {
  asOf,
  getLowStock,
  getSummary,
  OutletId,
  outletName,
  outlets,
  Period,
  periodLabel,
} from "@/lib/demo-data";
import { useBusiness } from "./business-provider";
import { liveLowStock, liveSummary } from "@/lib/operations";
import { WorkspaceContext } from "./workspace-context";
import { AiProvider, useAiSession } from "./ai-provider";
import { FloatingAssistant } from "./floating-assistant";
import { Logo, Modal } from "./ui";
import { api } from "@/lib/backend-state";
import { HistoryPaging } from "./history-paging";
import { AppLoading } from "./app-loading";

const futureItems = [
  { icon: CreditCard, label: "Kasir / POS", href: "/pos" },
  { icon: ReceiptText, label: "Transaksi", href: "/transactions" },
  { icon: Package, label: "Inventori", href: "/inventory" },
  { icon: ShoppingBag, label: "Pembelian", href: "/purchases" },
  { icon: Users, label: "Pelanggan", href: "/customers" },
  { icon: ChartNoAxesCombined, label: "Laporan", href: "/reports" },
];
export function Workspace({ children }: { children: React.ReactNode }) {
  const {
    state: business,
    session,
    refresh,
    loadReport,
    processing,
  } = useBusiness();
  const path = usePathname();
  const isAuth = [
    "/login",
    "/register",
    "/verify-email",
    "/forgot-password",
    "/onboarding",
    "/invite",
  ].some((p) => path.startsWith(p));
  const routeLabel =
    futureItems.find((i) => path.startsWith(i.href))?.label ||
    (path.startsWith("/settings")
      ? "Pengaturan"
      : path.startsWith("/admin")
        ? "Konsol operator"
        : "Dashboard");
  const isAi = path.startsWith("/ai");
  const isPricing = path.startsWith("/pricing");
  const isDashboard = path === "/" || path.startsWith("/dashboard");
  const [outlet, setOutletState] = useState<OutletId>("all");
  const [period, setPeriod] = useState<Period>("7");
  const [toast, notify] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [panel, setPanel] = useState<
    "help" | "quota" | "profile" | "notifications" | null
  >(null);
  const [used, setUsed] = useState(0);
  const role = business.remote?.role;
  const tenantId = business.remote?.tenant?.id as string | undefined;
  const outletStorageTenant = useRef<string | null>(null);
  const setOutlet = useCallback(
    (next: OutletId) => {
      setOutletState(next);
      if (!tenantId) return;
      try {
        window.localStorage.setItem(`nusa:outlet:${tenantId}`, next);
        outletStorageTenant.current = tenantId;
      } catch {
        /* Browser storage is optional; the in-memory selection still works. */
      }
    },
    [tenantId],
  );
  const canVisit = (href: string) => {
    if (href === "/admin") return Boolean(session?.operator);
    if (!role || isAuth) return true;
    if (href === "/settings") return ["owner", "manager"].includes(role);
    if (href === "/pricing") return role === "owner";
    if (href === "/purchases") return role !== "cashier";
    if (["/pos", "/transactions", "/customers"].includes(href))
      return role !== "inventory";
    if (href === "/reports") return ["owner", "manager"].includes(role);
    return true;
  };
  const quota =
    business.remote?.subscription?.status === "trial"
      ? 100
      : business.remote?.subscription?.plan?.ai_limit || 0;
  useEffect(() => {
    if (business.remote?.tenant && business.remote?.role !== "inventory")
      void loadReport(outlet, period);
  }, [outlet, period, business.remote?.asOf]);
  useEffect(
    () => setUsed(Number(business.remote?.aiUsed || 0)),
    [business.remote?.aiUsed],
  );
  useEffect(() => {
    if (!tenantId || !Array.isArray(business.remote?.outlets)) return;
    let saved: OutletId = "all";
    try {
      saved = window.localStorage.getItem(`nusa:outlet:${tenantId}`) || "all";
    } catch {
      /* Keep the safe aggregate default when browser storage is unavailable. */
    }
    const valid =
      saved === "all" ||
      business.remote.outlets.some((o: any) => o.id === saved && o.active);
    outletStorageTenant.current = tenantId;
    setOutletState(valid ? saved : "all");
  }, [business.remote?.outlets, tenantId]);
  useEffect(() => {
    if (outletStorageTenant.current !== tenantId) return;
    if (
      outlet !== "all" &&
      !business.remote?.outlets?.some((o: any) => o.id === outlet && o.active)
    )
      setOutlet("all");
  }, [business.remote?.outlets, outlet, setOutlet, tenantId]);
  const selectedContext = useRef({ outlet, period, business });
  selectedContext.current = { outlet, period, business };
  useEffect(() => {
    type ContextTool = {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute: (input: unknown) => unknown;
    };
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: ContextTool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "read_nusa_dashboard",
            title: "Read selected Nusa  summary",
            description:
              "Read the dashboard's currently selected outlet, period, sales metrics and low-stock snapshot. All values are local  data. Does not change state or confirm actions.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true },
            execute(input) {
              if (
                !input ||
                typeof input !== "object" ||
                Array.isArray(input) ||
                Object.keys(input).length > 0
              )
                throw new Error("Expected an empty object.");
              const { outlet: activeOutlet, period: activePeriod } =
                selectedContext.current;
              const data = liveSummary(
                selectedContext.current.business,
                activeOutlet,
                activePeriod,
              );
              return {
                demo: false,
                outlet: outletName(activeOutlet),
                period: periodLabel(activePeriod),
                asOf,
                netSales: data.sales,
                transactions: data.count,
                averageBasketBeforeRefund: data.basket,
                lowStockCount: liveLowStock(
                  selectedContext.current.business,
                  activeOutlet,
                ).length,
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {
        /* Optional browser capability; the UI remains available. */
      });
    } catch {
      /* Unsupported implementations must not affect the workspace. */
    }
    return () => lifecycle.abort();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => notify(""), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setMobileOpen(false);
    setNavigating(false);
  }, [path]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const low = liveLowStock(business, outlet);
  function beginNavigation(event: ReactMouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>(
      "a[href]",
    );
    if (!anchor || anchor.target === "_blank") return;
    const destination = new URL(anchor.href, window.location.href);
    if (
      destination.origin === window.location.origin &&
      destination.pathname !== window.location.pathname
    )
      setNavigating(true);
  }
  return (
    <WorkspaceContext.Provider
      value={{
        outlet,
        setOutlet,
        period,
        setPeriod,
        notify,
        used,
        quota,
        setUsed,
      }}
    >
      <AiProvider
        key={`${business.remote?.tenant?.id}-${role}-${JSON.stringify(business.remote?.outlets?.map((o: any) => o.id))}-${outlet}-${period}`}
      >
        <div
          className={isAuth ? "auth-workspace" : "regular-workspace"}
          onClickCapture={beginNavigation}
        >
          <a className="skip-link" href="#main-content">
            Langsung ke konten
          </a>
          {mobileOpen && (
            <button
              className="mobile-overlay"
              aria-label="Tutup navigasi"
              onClick={() => setMobileOpen(false)}
            />
          )}
          <aside
            className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
            aria-label="Navigasi utama"
          >
            <Link
              href="/dashboard"
              className="brand-link"
              aria-label="Nusa, Dashboard"
            >
              <Logo />
            </Link>
            <div className="sidebar-scroll">
              <button
                className="business-switch"
                onClick={() => setPanel("profile")}
              >
                <span className="business-icon">
                  <Store size={19} />
                </span>
                <span>
                  <strong>{business.settings.name}</strong>
                  <small>Ruang kerja Anda</small>
                </span>
                <ChevronDown size={15} />
              </button>
              <div className="nav-section-label">MENU UTAMA</div>
              <nav>
                <Link
                  className={`nav-item ${isDashboard ? "active" : ""}`}
                  href="/dashboard"
                  aria-current={isDashboard ? "page" : undefined}
                >
                  <LayoutDashboard size={19} />
                  <span>Dashboard</span>
                </Link>
                <Link
                  className={`nav-item ${isAi ? "active" : ""}`}
                  href="/ai"
                  aria-current={isAi ? "page" : undefined}
                >
                  <Sparkles size={19} />
                  <span>AI Assistant</span>
                  <span className="new-badge">BARU</span>
                </Link>
                <div className="nav-divider" />
                {futureItems
                  .filter(({ href }) => canVisit(href))
                  .map(({ icon: Icon, label, href }) => (
                    <Link
                      key={href}
                      href={href}
                      className={`nav-item ${path.startsWith(href) ? "active" : ""}`}
                      aria-current={path.startsWith(href) ? "page" : undefined}
                    >
                      <Icon size={19} />
                      <span>{label}</span>
                    </Link>
                  ))}
                <Link
                  href="/settings"
                  hidden={!canVisit("/settings")}
                  className={`nav-item ${path.startsWith("/settings") ? "active" : ""}`}
                >
                  <Settings size={19} />
                  <span>Pengaturan</span>
                </Link>
              </nav>
              <div className="sidebar-bottom">
                <Link
                  className={`nav-item ${isPricing ? "active" : ""}`}
                  href="/pricing"
                  hidden={!canVisit("/pricing")}
                  aria-current={isPricing ? "page" : undefined}
                >
                  <CreditCard size={19} />
                  <span>Paket & langganan</span>
                </Link>
                <div className="quota-card">
                  <div className="quota-title">
                    <span>
                      <Sparkles size={16} /> Nusa AI
                    </span>
                    <span className="pro-badge">TRIAL</span>
                  </div>
                  <p>Ide besar untuk usaha Anda.</p>
                  <div className="quota-track">
                    <span
                      style={{
                        width: `${quota ? Math.min(100, (used / quota) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <div className="quota-caption">
                    <span>
                      {used} dari {quota} pesan
                    </span>
                    <span>{Math.max(0, quota - used)} tersisa</span>
                  </div>
                  <button onClick={() => setPanel("quota")}>
                    Lihat penggunaan <ArrowUpRight size={15} />
                  </button>
                </div>
                <button
                  className="nav-item muted"
                  onClick={() => setPanel("help")}
                >
                  <CircleHelp size={19} />
                  <span>Pusat bantuan</span>
                  <ArrowUpRight size={16} />
                </button>
                <button
                  className="profile-button"
                  onClick={() => setPanel("profile")}
                >
                  <span className="avatar">AP</span>
                  <span>
                    <strong>
                      {business.members.find(
                        (m) => m.id === business.remote?.membershipId,
                      )?.name || "Akun Anda"}
                    </strong>
                    <small>{business.remote?.role || "Pengguna"}</small>
                  </span>
                  <ChevronDown size={15} />
                </button>
              </div>
            </div>
          </aside>
          <div className="workspace-main">
            <header className="topbar">
              <div className="breadcrumb">
                <button
                  className="icon-button mobile-menu"
                  onClick={() => setMobileOpen(!mobileOpen)}
                  aria-label="Buka navigasi"
                  aria-expanded={mobileOpen}
                >
                  <Menu size={21} />
                </button>
                <span className="breadcrumb-business">Workspace</span>
                <ChevronRight size={15} />
                <strong>
                  {isAi
                    ? "AI Assistant"
                    : isPricing
                      ? "Paket & langganan"
                      : routeLabel}
                </strong>
              </div>
              <div className="topbar-actions">
                <span className="-badge">
                  {business.subscription || "Nusa"}
                </span>
                <div className="outlet-select">
                  <Store size={16} />
                  <select
                    aria-label="Pilih outlet"
                    value={outlet}
                    onChange={(e) => setOutlet(e.target.value as OutletId)}
                  >
                    {outlets.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                        {"new" in o ? " (baru)" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
                <span className="topbar-divider" />
                <button
                  className="icon-button notification-button"
                  aria-label={`Notifikasi, ${low.length} stok rendah`}
                  onClick={() => setPanel("notifications")}
                >
                  <Bell size={19} />
                  {low.length > 0 && <span />}
                </button>
                <button
                  className="avatar top-avatar"
                  aria-label="Profil Andi Pratama"
                  onClick={() => setPanel("profile")}
                >
                  AP
                </button>
              </div>
            </header>
            <main
              id="main-content"
              className={isAi ? "main-content chat-main" : "main-content"}
            >
              {canVisit(path.replace(/\/$/, "") || "/") ? (
                <>
                  <HistoryPaging path={path} />
                  {children}
                </>
              ) : (
                <div className="ops-page">
                  <h1>Akses terbatas</h1>
                  <p>
                    Halaman ini tidak tersedia untuk peran Anda. Pilih menu yang
                    tersedia di navigasi.
                  </p>
                </div>
              )}
            </main>
          </div>
          {(navigating || processing) && (
            <AppLoading
              overlay
              label={navigating ? "Membuka halaman…" : "Menyimpan perubahan…"}
            />
          )}
          <AiProgress />
        </div>
        <FloatingAssistant />
        {toast && (
          <div className="toast" role="status">
            <span className="toast-icon">
              <Check size={16} />
            </span>
            {toast}
            <button aria-label="Tutup pemberitahuan" onClick={() => notify("")}>
              <X size={17} />
            </button>
          </div>
        )}
        <Modal
          open={panel === "help"}
          onOpenChange={() => setPanel(null)}
          title="Selamat datang di Nusa"
          description="Panduan singkat untuk menjelajahi workspace ."
        >
          <div className="help-items">
            <p>
              <LayoutDashboard size={20} />
              <span>
                <strong>Pantau bisnis Anda</strong>Ganti outlet dan periode
                untuk melihat penjualan, produk teratas, serta stok yang perlu
                diisi.
              </span>
            </p>
            <p>
              <Sparkles size={20} />
              <span>
                <strong>Tanyakan ke Nusa AI</strong>Coba pertanyaan yang
                disarankan atau tulis pertanyaan tentang penjualan dan stok.
              </span>
            </p>
            <p>
              <ShoppingBag size={20} />
              <span>
                <strong>Tinjau sebelum menyetujui</strong>Periksa preview
                pembelian. Konfirmasi menyimpan draft; penerimaan barang tetap
                memerlukan pemeriksaan dan persetujuan.
              </span>
            </p>
          </div>
          <div className="info-note">
            Data dibatasi oleh peran dan outlet Anda. Harga, saldo stok, dan
            izin diperiksa kembali oleh server sebelum perubahan disimpan.
          </div>
        </Modal>
        <Modal
          open={panel === "quota"}
          onOpenChange={() => setPanel(null)}
          title="Penggunaan Nusa AI"
          description={business.subscription}
        >
          <div className="usage-big">
            {used}
            <span> / {quota} pesan</span>
          </div>
          <div className="quota-track">
            <span
              style={{
                width: `${quota ? Math.min(100, (used / quota) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="body-muted">
            {Math.max(0, quota - used)} pesan tersedia. Periode berakhir{" "}
            {business.remote?.subscription?.period_end
              ? new Date(
                  business.remote.subscription.period_end,
                ).toLocaleDateString("id-ID")
              : "—"}
            .
          </p>
          <div className="info-note">
            Kuota dimiliki bersama oleh anggota tenant. Satu jawaban berhasil
            dihitung sebagai satu pesan.
          </div>
          <Link
            className="button primary full"
            href="/pricing"
            onClick={() => setPanel(null)}
          >
            Bandingkan paket <ArrowUpRight size={16} />
          </Link>
        </Modal>
        <Modal
          open={panel === "profile"}
          onOpenChange={() => setPanel(null)}
          title="Workspace Anda"
          description="Profil dan akses ruang kerja aktif."
        >
          <div className="profile-detail">
            <span className="avatar large">AP</span>
            <div>
              <h3>Akun Anda</h3>
              <p>
                {business.remote?.role} · {business.settings.name}
              </p>
            </div>
          </div>
          {session?.tenants?.length > 1 && (
            <label className="field">
              Ruang kerja aktif
              <select
                value={business.remote?.tenant?.id || ""}
                onChange={async (e) => {
                  try {
                    await api("switch-tenant", { tenantId: e.target.value });
                    setOutletState("all");
                    outletStorageTenant.current = null;
                    await refresh();
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                {session.tenants.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="detail-list">
            <div>
              <span>Bidang usaha</span>
              <strong>Ritel & kebutuhan harian</strong>
            </div>
            <div>
              <span>Outlet</span>
              <strong>
                {
                  new Set(
                    business.registers
                      .filter((r) => r.active)
                      .map((r) => r.outlet),
                  ).size
                }{" "}
                aktif
              </strong>
            </div>
            <div>
              <span>Zona waktu</span>
              <strong>Asia/Jakarta (WIB)</strong>
            </div>
            <div>
              <span>Akses</span>
              <strong>{business.remote?.role}</strong>
            </div>
          </div>
          <div className="dialog-actions">
            <button
              className="button secondary"
              onClick={async () => {
                await fetch("/api/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ op: "logout" }),
                });
                window.location.assign("/login");
              }}
            >
              Keluar
            </button>
            <Link
              href="/settings"
              className="button secondary"
              onClick={() => setPanel(null)}
            >
              Pengaturan
            </Link>
            <Link
              href="/login"
              className="button primary"
              onClick={() => setPanel(null)}
            >
              Lihat alur masuk
            </Link>
          </div>
        </Modal>
        <Modal
          open={panel === "notifications"}
          onOpenChange={() => setPanel(null)}
          title="Notifikasi"
          description="Kondisi stok dari data  terbaru."
        >
          <div className="notification-list">
            {low.length ? (
              low.map((item) => (
                <div key={`${item.productId}-${item.outlet}`}>
                  <span className="notification-symbol">
                    <Package size={19} />
                  </span>
                  <div>
                    <strong>{item.product.name}</strong>
                    <p>
                      {outletName(item.outlet)} · Sisa {item.stock} unit,
                      minimum {item.minimum}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p>Belum ada notifikasi untuk outlet ini.</p>
            )}
          </div>
          <Link
            href="/ai?prompt=restock"
            className="button primary full"
            onClick={() => setPanel(null)}
          >
            Tinjau bersama Nusa AI <ArrowUpRight size={16} />
          </Link>
        </Modal>
      </AiProvider>
    </WorkspaceContext.Provider>
  );
}

function AiProgress() {
  const { pending } = useAiSession();
  if (!pending) return null;
  return (
    <div className="app-progress" role="status" aria-label="Nusa AI memproses">
      <span />
    </div>
  );
}
