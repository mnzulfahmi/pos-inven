"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { BusinessState } from "@/lib/operations";
import { emptyBusiness, mapBusiness, saveIntent } from "@/lib/backend-state";
import { setLiveOutlets } from "@/lib/demo-data";
import { AppLoading } from "./app-loading";
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
type Business = {
  state: BusinessState;
  session: any;
  loading: boolean;
  processing: boolean;
  refresh: () => Promise<void>;
  loadReport: (outlet: string, period: string) => Promise<void>;
  loadMore: (kind: string) => Promise<void>;
  commit: <T>(action: (draft: BusinessState) => T) => Promise<Result<T>>;
};
const Context = createContext<Business | null>(null);
export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(emptyBusiness),
    [session, setSession] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [processing, setProcessing] = useState(false),
    [error, setError] = useState(""),
    [invite, setInvite] = useState("");
  const current = useRef(state),
    busy = useRef(false);
  const path = usePathname().replace(/\/$/, "") || "/",
    router = useRouter();
  const publicPage = [
    "/login",
    "/register",
    "/verify-email",
    "/forgot-password",
    "/invite",
  ].includes(path);
  async function loadReport(outlet: string, period: string) {
    const tenant = current.current.remote?.tenant?.id;
    if (!tenant) return;
    const r = await fetch(
      "/api/reports?outlet=" + encodeURIComponent(outlet) + "&period=" + period,
    );
    const data = await r.json();
    if (!r.ok) return;
    if (current.current.remote?.tenant?.id !== tenant) return;
    const next = {
      ...current.current,
      remote: {
        ...current.current.remote,
        reports: {
          ...current.current.remote?.reports,
          [outlet + "-" + period]: data,
        },
      },
    };
    current.current = next;
    setState(next);
  }
  async function page(kind: string, next: number) {
    const response = await fetch(
      `/api/business/list?kind=${encodeURIComponent(kind)}&page=${next}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Gagal memuat data");
    return data;
  }
  async function loadMore(kind: string) {
    if (busy.current) return;
    const raw = current.current.remote;
    const nextPage = raw?.pages?.[kind];
    if (nextPage == null) return;
    busy.current = true;
    setProcessing(true);
    try {
      const data = await page(kind, nextPage);
      if (current.current.remote?.tenant?.id !== raw?.tenant?.id) return;
      const merged = {
        ...raw,
        [kind]: [...raw![kind], ...data.items],
        pages: { ...raw?.pages, [kind]: data.nextPage },
      };
      const next = mapBusiness(merged);
      current.current = next;
      setState(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setProcessing(false);
    }
  }
  async function refresh() {
    const response = await fetch("/api/business", { cache: "no-store" });
    const data = await response.json();
    if (response.status === 401 || response.status === 403) {
      setSession(null);
      current.current = emptyBusiness();
      setState(current.current);
      setLiveOutlets([], new Date().toISOString());
      if (!publicPage) router.replace("/login");
      return;
    }
    if (!response.ok) throw new Error(data.error);
    // The POS needs the complete active catalog. Fetch bounded pages only on
    // initial load, explicit refresh, navigation, and committed mutations.
    if (data.raw) {
      for (const kind of ["products", "balances"]) {
        while (data.raw.pages?.[kind] != null) {
          const next = await page(kind, data.raw.pages[kind]);
          data.raw[kind].push(...next.items);
          data.raw.pages[kind] = next.nextPage;
        }
      }
    }
    setSession(data.session);
    const next = data.raw ? mapBusiness(data.raw) : emptyBusiness();
    setLiveOutlets(
      data.raw?.outlets.filter((o: any) => o.active) || [],
      data.raw?.asOf || new Date().toISOString(),
    );
    current.current = next;
    setState(next);
    if (!publicPage && !data.session.verified) router.replace("/verify-email");
    else if (
      !publicPage &&
      !data.raw &&
      path !== "/onboarding" &&
      !(path === "/admin" && data.session.operator)
    )
      router.replace("/onboarding");
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh()
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [path]);
  useEffect(() => {
    const cb = (e: Event) => setInvite((e as CustomEvent).detail);
    window.addEventListener("nusa:invite", cb);
    return () => window.removeEventListener("nusa:invite", cb);
  }, []);
  useEffect(() => {
    if (publicPage) return;
    const onFocus = () => {
      if (!busy.current && document.visibilityState === "visible")
        void refresh().catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [path]);
  const commit: Business["commit"] = async (action) => {
    if (busy.current)
      return { ok: false, error: "Permintaan sebelumnya masih diproses." };
    busy.current = true;
    setProcessing(true);
    try {
      const draft = structuredClone(current.current);
      let value = action(draft);
      const result = await saveIntent(current.current, draft);
      await refresh();
      if (typeof value === "string" && result.id) value = result.id;
      setError("");
      return { ok: true, value };
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      await refresh().catch(() => {});
      return { ok: false, error: message };
    } finally {
      busy.current = false;
      setProcessing(false);
    }
  };
  return (
    <Context.Provider
      value={{
        state,
        session,
        loading,
        processing,
        refresh,
        loadReport,
        loadMore,
        commit,
      }}
    >
      {error && (
        <div
          role="alert"
          className="info-note"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1000,
            background: "#fff0e8",
            padding: 16,
          }}
        >
          {error}
          <button
            className="text-button"
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            Muat ulang
          </button>
        </div>
      )}
      {invite && (
        <div className="info-note" style={{ padding: 20 }}>
          <strong>
            Tautan undangan — bagikan kepada anggota yang diundang
          </strong>
          <input
            aria-label="Tautan undangan"
            readOnly
            value={invite}
            onFocus={(e) => e.target.select()}
            style={{ width: "100%" }}
          />
          <button onClick={() => setInvite("")}>Tutup</button>
        </div>
      )}
      {loading && !publicPage ? <AppLoading /> : children}
    </Context.Provider>
  );
}
export function useBusiness() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("BusinessProvider missing");
  return ctx;
}
