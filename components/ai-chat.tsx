"use client";
import { useBusiness } from "./business-provider";
import {
  liveSummary,
  liveLowStock,
  liveTopProducts,
  balance,
  createPurchase,
  uid,
  audit,
} from "@/lib/operations";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ClipboardCheck,
  Copy,
  FileText,
  History,
  Info,
  MessageSquare,
  Package,
  Plus,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
} from "lucide-react";
import {
  asOf,
  inventory,
  money,
  number,
  outletName,
  periodLabel,
  products,
} from "@/lib/demo-data";
import { PeriodSelect } from "./dashboard";
import { Modal } from "./ui";
import { Field } from "./operations/shared";
import { useWorkspace } from "./workspace-context";
import { useAiSession } from "./ai-provider";
import type { Message } from "@/lib/demo-agent";
import type { AiInputField, AiInputTask } from "@/lib/ai-input-actions";

const starters = [
  {
    icon: TrendingUp,
    title: "Bagaimana penjualan saya?",
    description: "Lihat ringkasan dan tren usaha",
    prompt: "Bagaimana penjualan saya pada periode ini?",
    color: "orange",
  },
  {
    icon: Package,
    title: "Apa yang perlu direstock?",
    description: "Jaga produk favorit tetap tersedia",
    prompt: "Produk apa yang perlu direstock?",
    color: "blue",
  },
  {
    icon: FileText,
    title: "Bantu siapkan pembelian",
    description: "Buat draft PO dari kebutuhan stok",
    prompt: "Buatkan draft PO untuk produk yang perlu direstock.",
    color: "purple",
  },
  {
    icon: ChartIcon,
    title: "Produk mana yang paling laris?",
    description: "Kenali produk andalan toko Anda",
    prompt: "Produk mana yang paling laris pada periode ini?",
    color: "green",
  },
  {
    icon: ClipboardCheck,
    title: "Apa yang perlu saya setujui?",
    description: "Kelola tugas sesuai role dan outlet",
    prompt: "Apa yang perlu saya setujui?",
    color: "orange",
  },
];
function ChartIcon({ size = 20 }: { size?: number }) {
  return <TrendingUp size={size} />;
}

function inputDisplayValue(field: AiInputField, value: string) {
  if (!value) return "Belum diisi";
  const option = field.options?.find((item) => item.value === value);
  if (option) return option.label;
  if (field.type === "number" && /harga|biaya/i.test(field.label))
    return money(Number(value));
  return value;
}

function AiInputTaskCard({
  message,
  task,
  busy,
  error,
  onPrepare,
  onConfirm,
}: {
  message: Message;
  task: AiInputTask;
  busy: boolean;
  error?: string;
  onPrepare: (
    message: Message,
    values: Record<string, string>,
  ) => Promise<void>;
  onConfirm: (message: Message) => Promise<void>;
}) {
  const [values, setValues] = useState(task.values);
  const [modalOpen, setModalOpen] = useState(task.stage === "form");
  useEffect(() => {
    setValues(task.values);
    setModalOpen(task.stage === "form");
  }, [task]);
  const updateValue = (name: string, value: string) =>
    setValues((current) => ({ ...current, [name]: value }));
  return (
    <>
      <section
        className={`ai-input-card ${task.stage === "completed" ? "is-completed" : ""}`}
      >
        <div className="ai-input-heading">
          <span className="ai-proposal-icon">
            {task.action === "product" ? (
              <Package size={18} />
            ) : (
              <FileText size={18} />
            )}
          </span>
          <div>
            <span>FORMULIR NUSA AI</span>
            <strong>{task.title}</strong>
          </div>
          <span className="ai-proposal-status">
            {task.stage === "completed" ? (
              <>
                <Check size={12} /> Tersimpan
              </>
            ) : task.stage === "form" ? (
              "Perlu dilengkapi"
            ) : (
              "Perlu konfirmasi"
            )}
          </span>
        </div>
        <p className="ai-input-description">{task.description}</p>
        {task.stage === "form" ? (
          <div className="ai-input-ready">
            <div>
              <strong>Lengkapi data sebelum disimpan</strong>
              <span>
                Nama dari percakapan sudah dimasukkan. Field lain tetap kosong
                sampai Anda mengisinya.
              </span>
            </div>
            <button
              type="button"
              className="button primary compact"
              onClick={() => setModalOpen(true)}
            >
              Lengkapi data
            </button>
          </div>
        ) : (
          <>
            <dl className="ai-input-review">
              {task.fields.map((field) => (
                <div key={field.name}>
                  <dt>{field.label}</dt>
                  <dd>
                    {inputDisplayValue(field, task.values[field.name] || "")}
                  </dd>
                </div>
              ))}
            </dl>
            {error && (
              <p className="ai-proposal-error" role="alert">
                {error}
              </p>
            )}
            <div className="ai-input-actions">
              <span>
                <ShieldCheck size={12} /> Server memeriksa role dan data kembali
              </span>
              {task.stage === "review" ? (
                <div>
                  <button
                    type="button"
                    className="button secondary compact"
                    disabled={busy}
                    onClick={() => setModalOpen(true)}
                  >
                    Ubah data
                  </button>
                  <button
                    type="button"
                    className="button primary compact"
                    disabled={busy}
                    onClick={() => void onConfirm(message)}
                  >
                    {busy ? (
                      <>
                        <span className="ai-proposal-spinner" /> Menyimpan...
                      </>
                    ) : (
                      "Konfirmasi & simpan"
                    )}
                  </button>
                </div>
              ) : (
                <Link href={task.targetHref}>
                  Buka data <ArrowUpRight size={12} />
                </Link>
              )}
            </div>
          </>
        )}
      </section>
      <Modal
        wide={task.action === "product"}
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={task.title}
        description={task.description}
      >
        <form
          className="ops-form ai-input-modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onPrepare(message, values);
          }}
        >
          <div
            className={
              task.action === "product"
                ? "ops-form-grid"
                : "ai-input-single-grid"
            }
          >
            {task.fields.map((field) => (
              <Field
                key={field.name}
                label={`${field.label}${field.required ? "" : " (opsional)"}`}
                hint={field.help}
              >
                {field.type === "textarea" ? (
                  <textarea
                    required={field.required}
                    value={values[field.name] || ""}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                      updateValue(field.name, event.target.value)
                    }
                  />
                ) : field.type === "select" ? (
                  <select
                    required={field.required}
                    value={values[field.name] || ""}
                    onChange={(event) =>
                      updateValue(field.name, event.target.value)
                    }
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required={field.required}
                    type={field.type}
                    list={
                      field.options?.length
                        ? `ai-${task.id}-${field.name}`
                        : undefined
                    }
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={values[field.name] || ""}
                    placeholder={field.placeholder}
                    onChange={(event) => {
                      const raw = event.target.value;
                      updateValue(
                        field.name,
                        field.type === "number" && /^0\d/.test(raw)
                          ? String(Number(raw))
                          : raw,
                      );
                    }}
                  />
                )}
                {field.type !== "select" && !!field.options?.length && (
                  <datalist id={`ai-${task.id}-${field.name}`}>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value} />
                    ))}
                  </datalist>
                )}
              </Field>
            ))}
          </div>
          {error && (
            <p className="ai-proposal-error" role="alert">
              {error}
            </p>
          )}
          <div className="ai-input-modal-actions">
            <span>
              <ShieldCheck size={12} /> {task.requiredRole}
            </span>
            <div>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setModalOpen(false)}
              >
                Batal
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? (
                  <>
                    <span className="ai-proposal-spinner" /> Memeriksa...
                  </>
                ) : (
                  "Tinjau data"
                )}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function AiChat({ compact = false }: { compact?: boolean }) {
  return <ChatContent compact={compact} />;
}
function ChatContent({ compact }: { compact: boolean }) {
  const { state: business, commit, refresh } = useBusiness();
  const getSummary = (
    o: import("@/lib/demo-data").OutletId,
    p: import("@/lib/demo-data").Period,
  ) => liveSummary(business, o, p);
  const getLowStock = (o: import("@/lib/demo-data").OutletId) =>
    liveLowStock(business, o);
  const getTopProducts = (
    o: import("@/lib/demo-data").OutletId,
    p: import("@/lib/demo-data").Period,
  ) => liveTopProducts(business, o, p);
  const { outlet, period, used, quota, notify } = useWorkspace();
  const {
    conversations,
    setConversations,
    activeId,
    setActiveId,
    messages,
    setMessages,
    input,
    setInput,
    pending,
    taskInProgressId,
    taskErrors,
    confirmTask,
    inputTaskInProgressId,
    inputTaskErrors,
    prepareInputTask,
    confirmInputTask,
    send,
    newChat: resetChat,
  } = useAiSession();
  function newChat() {
    resetChat();
    textarea.current?.focus();
  }
  const [showHistory, setShowHistory] = useState(false);
  const [action, setAction] = useState<Message | null>(null);
  const [actionOutlet, setActionOutlet] = useState<string>(
    outlet === "all" ? "dago" : outlet,
  );
  const [reason, setReason] = useState("");
  const [sourceOpen, setSourceOpen] = useState<string | null>(null);
  const [confirmingProposalId, setConfirmingProposalId] = useState<
    string | null
  >(null);
  const [proposalErrors, setProposalErrors] = useState<Record<string, string>>(
    {},
  );
  const bottom = useRef<HTMLDivElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const initialPrompt = useRef(false);
  const summary = getSummary(outlet, period);
  const low = getLowStock(outlet);
  const top = getTopProducts(outlet, period);
  const approvalTaskCount = new Set(
    messages.flatMap((message) =>
      (message.tasks || [])
        .filter((task) => task.status === "pending")
        .map((task) => task.id),
    ),
  ).size;
  const inputTaskCount = messages.filter(
    (message) => message.inputTask && message.inputTask.stage !== "completed",
  ).length;
  const openTaskCount = approvalTaskCount + inputTaskCount;
  useEffect(() => {
    if (messages.length === 0) {
      scrollArea.current?.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    scrollArea.current?.scrollTo({
      top: scrollArea.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);
  useEffect(() => {
    if (compact || initialPrompt.current) return;
    initialPrompt.current = true;
    const prompt = new URLSearchParams(window.location.search).get("prompt");
    if (prompt) {
      setInput(
        prompt === "restock"
          ? "Produk apa yang perlu direstock?"
          : "Bagaimana penjualan saya pada periode ini?",
      );
      window.history.replaceState(null, "", window.location.pathname);
      textarea.current?.focus();
    }
  }, []);
  function openAction(message: Message) {
    setAction(message);
    setActionOutlet(
      message.savedOutlet ?? (outlet === "all" ? "dago" : outlet),
    );
    setReason(message.savedReason ?? "");
  }
  const actionProduct = business.products.find(
    (p) => p.id === action?.productId,
  );
  const orderRows =
    action?.productId && actionProduct
      ? [
          {
            product: actionProduct,
            qty: Math.max(
              1,
              action.requestedQty ??
                getLowStock(actionOutlet).find(
                  (r) => r.productId === actionProduct.id,
                )?.recommended ??
                24,
            ),
          },
        ]
      : getLowStock(actionOutlet).map((item) => ({
          product: item.product,
          qty: item.recommended,
        }));
  const orderTotal = orderRows.reduce(
    (sum, row) => sum + row.qty * row.product.cost,
    0,
  );
  const systemStock = actionProduct
    ? balance(business, actionOutlet, actionProduct.id).stock
    : 0;
  const physicalStock = action?.requestedQty ?? 18;
  async function confirmAction(event: React.FormEvent) {
    event.preventDefault();
    if (!action || action.confirmed || !actionProduct) return;
    const result = await commit((s) => {
      if (action.kind === "po")
        return createPurchase(
          s,
          actionOutlet,
          "s1",
          orderRows
            .filter((r) => r.qty > 0)
            .map((r) => ({
              productId: r.product.id,
              quantity: r.qty,
              cost: r.product.cost,
            })),
        );
      s.proposals.unshift({
        id: uid("COUNT"),
        outlet: actionOutlet,
        productId: actionProduct.id,
        physical: physicalStock,
        version: balance(s, actionOutlet, actionProduct.id).version,
        reason,
        status: "Menunggu",
      });
      audit(s, "Usulan stok AI disimpan");
    });
    if (!result.ok) {
      notify(result.error);
      return;
    }
    const updated = messages.map((m) =>
      m.id === action.id
        ? {
            ...m,
            confirmed: true,
            savedOutlet: actionOutlet,
            savedReason: reason,
          }
        : m,
    );
    setMessages(updated);
    setConversations((items) =>
      items.map((c) => (c.id === activeId ? { ...c, messages: updated } : c)),
    );
    setAction(null);
    notify(
      action.kind === "correction"
        ? "Usulan disimpan di Inventori → Stok opname untuk persetujuan."
        : "Draft PO  tersimpan di halaman Pembelian.",
    );
  }
  async function confirmProposal(message: Message) {
    const proposal = message.proposal;
    if (!proposal || proposal.result || confirmingProposalId === proposal.id)
      return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setConfirmingProposalId(proposal.id);
    setProposalErrors((errors) => ({ ...errors, [proposal.id]: "" }));
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "confirm", id: proposal.id }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Draft belum dapat disimpan.");

      const updateProposal = (items: Message[]) =>
        items.map((item) =>
          item.id === message.id ? { ...item, proposal: data } : item,
        );
      setMessages(updateProposal);
      setConversations((items) =>
        items.map((conversation) =>
          conversation.id === activeId
            ? {
                ...conversation,
                messages: updateProposal(conversation.messages),
              }
            : conversation,
        ),
      );
      notify(
        data.operation === "create-count"
          ? "Opname disimpan untuk persetujuan di Persediaan. Stok belum berubah."
          : "Draft pembelian disimpan. Buka Pembelian untuk peninjauan dan persetujuan.",
      );

      void refresh().catch(() => {
        setProposalErrors((errors) => ({
          ...errors,
          [proposal.id]:
            "Draft sudah tersimpan, tetapi data terbaru belum berhasil dimuat. Muat ulang halaman untuk memperbaruinya.",
        }));
      });
    } catch (error) {
      const messageText =
        error instanceof DOMException && error.name === "AbortError"
          ? "Konfirmasi terlalu lama. Coba lagi; permintaan ini aman untuk diulang."
          : (error as Error).message || "Draft belum dapat disimpan.";
      setProposalErrors((errors) => ({
        ...errors,
        [proposal.id]: messageText,
      }));
      notify(messageText);
    } finally {
      window.clearTimeout(timeout);
      setConfirmingProposalId(null);
    }
  }
  return (
    <div className={`ai-page page-enter ${compact ? "ai-compact" : ""}`}>
      <div className="page-heading ai-heading">
        <div>
          <div className="title-with-badge">
            <h1>
              AI Assistant<span className="heading-dot">.</span>
            </h1>
            <span className="ai-beta">BETA</span>
          </div>
          <p>Teman berpikir untuk setiap langkah usaha Anda.</p>
        </div>
        <div className="heading-actions">
          <button
            className="button secondary history-toggle"
            onClick={() => setShowHistory(true)}
          >
            <History size={16} />
            Riwayat
          </button>
          <button className="button secondary" onClick={newChat}>
            <Plus size={16} />
            Chat baru
          </button>
        </div>
      </div>
      <div className="mobile-chat-context">
        <PeriodSelect />
        <span>
          <ShieldCheck size={13} />
          Percakapan privat
        </span>
      </div>
      <div className="ai-layout">
        <section
          className={`chat-panel ${messages.length ? "has-messages" : ""}`}
          aria-label={compact ? "Chat cepat Nusa AI" : "Percakapan Nusa AI"}
        >
          <div className="chat-context-bar">
            <span>
              <span className="assistant-mini">
                <Sparkles size={14} />
              </span>
              <strong>Nusa AI</strong>
              <span className="assistant-status">Asisten bisnis Anda</span>
            </span>
            <span className="private-label">
              <ShieldCheck size={14} />
              Hanya untuk Anda
            </span>
          </div>
          <div className="chat-scroll" ref={scrollArea}>
            {messages.length === 0 ? (
              <div className="chat-welcome">
                <div className="ai-orb">
                  <Sparkles size={33} strokeWidth={1.5} />
                  <span className="orb-small">
                    <Plus size={12} />
                  </span>
                </div>
                <div className="welcome-eyebrow">
                  LEBIH PAHAM, LEBIH SIAP MELANGKAH
                </div>
                <h2>Ada yang bisa Nusa bantu?</h2>
                <p>
                  {business.remote?.tenant
                    ? "Tanyakan penjualan, cek stok, atau siapkan pembelian. Kita mulai dari apa hari ini?"
                    : "Masuk dan selesaikan pengaturan usaha untuk bertanya tentang data bisnis Anda."}
                </p>
                <div className="suggestion-grid">
                  {starters.map(
                    ({ icon: Icon, title, description, prompt, color }) => (
                      <button
                        className="suggestion-card"
                        key={title}
                        onClick={() => send(prompt)}
                        disabled={pending || used >= quota}
                      >
                        <span className={`suggestion-icon ${color}`}>
                          <Icon size={20} />
                        </span>
                        <strong>{title}</strong>
                        <span>{description}</span>
                        <ArrowUpRight size={16} className="suggestion-arrow" />
                      </button>
                    ),
                  )}
                </div>
                <div className="welcome-disclaimer">
                  <ShieldCheck size={13} />
                  Data bisnis Anda, percakapan privat Anda.
                </div>
              </div>
            ) : (
              <div
                className="messages"
                aria-live="polite"
                aria-relevant="additions"
              >
                {messages.map((message) => (
                  <article
                    className={`message ${message.role}`}
                    key={message.id}
                  >
                    {message.role === "assistant" ? (
                      <span className="message-avatar">
                        <Sparkles size={18} />
                      </span>
                    ) : (
                      <span className="avatar message-user-avatar">AP</span>
                    )}
                    <div className="message-main">
                      <div className="message-author">
                        {message.role === "assistant" ? "Nusa AI" : "Anda"}
                        <span>
                          {message.role === "assistant"
                            ? "Asisten bisnis"
                            : "Pemilik usaha"}
                        </span>
                      </div>
                      <p className="message-text">{message.text}</p>
                      {message.source && (
                        <small>
                          Sumber: database usaha · {message.source.periodDays}{" "}
                          hari ·{" "}
                          {new Date(message.source.asOf).toLocaleString(
                            "id-ID",
                          )}{" "}
                          WIB
                        </small>
                      )}
                      {message.proposal && (
                        <div
                          className={`ai-proposal-card ${message.proposal.result ? "is-saved" : ""}`}
                        >
                          <div className="ai-proposal-heading">
                            <span className="ai-proposal-icon">
                              {message.proposal.operation === "create-count" ? (
                                <Package size={18} />
                              ) : (
                                <FileText size={18} />
                              )}
                            </span>
                            <div className="ai-proposal-heading-copy">
                              <span>USULAN NUSA AI</span>
                              <strong>
                                {message.proposal.operation === "create-count"
                                  ? "Pratinjau opname"
                                  : "Pratinjau draft pembelian"}
                              </strong>
                            </div>
                            <span className="ai-proposal-status">
                              {message.proposal.result ? (
                                <>
                                  <Check size={12} /> Tersimpan
                                </>
                              ) : (
                                "Perlu konfirmasi"
                              )}
                            </span>
                          </div>
                          <dl className="ai-proposal-meta">
                            <div>
                              <dt>Outlet</dt>
                              <dd>
                                {outletName(message.proposal.payload.outletId)}
                              </dd>
                            </div>
                            <div>
                              <dt>
                                {message.proposal.operation === "create-count"
                                  ? "Alasan"
                                  : "Pemasok"}
                              </dt>
                              <dd>
                                {message.proposal.operation === "create-count"
                                  ? message.proposal.payload.reason
                                  : business.suppliers.find(
                                      (supplier) =>
                                        supplier.id ===
                                        message.proposal!.payload.supplierId,
                                    )?.name || "Pemasok tidak ditemukan"}
                              </dd>
                            </div>
                          </dl>
                          <div className="ai-proposal-lines">
                            {message.proposal.payload.lines.map(
                              (line: any, index: number) => (
                                <div
                                  className="ai-proposal-line"
                                  key={`${line.productId}-${index}`}
                                >
                                  <div>
                                    <strong>
                                      {business.products.find(
                                        (product) =>
                                          product.id === line.productId,
                                      )?.name || "Produk tidak ditemukan"}
                                    </strong>
                                    <span>
                                      {message.proposal!.operation ===
                                      "create-count"
                                        ? "Stok sistem → stok fisik"
                                        : "Jumlah × harga beli"}
                                    </span>
                                  </div>
                                  <b>
                                    {message.proposal!.operation ===
                                    "create-count" ? (
                                      <>
                                        {line.expected}
                                        <ArrowRight size={13} />
                                        {line.physical}
                                      </>
                                    ) : (
                                      `${line.quantity} × ${money(line.cost)}`
                                    )}
                                  </b>
                                </div>
                              ),
                            )}
                          </div>
                          {proposalErrors[message.proposal.id] && (
                            <p className="ai-proposal-error" role="alert">
                              {proposalErrors[message.proposal.id]}
                            </p>
                          )}
                          <div className="ai-proposal-actions">
                            <p>
                              {message.proposal.result
                                ? message.proposal.operation === "create-count"
                                  ? "Menunggu persetujuan di Persediaan. Stok belum berubah."
                                  : "Tersedia di Pembelian untuk ditinjau sebelum disetujui."
                                : "Periksa rincian sebelum menyimpan draft ini."}
                            </p>
                            <button
                              className="button primary compact"
                              disabled={
                                !!message.proposal.result ||
                                confirmingProposalId === message.proposal.id
                              }
                              onClick={() => void confirmProposal(message)}
                            >
                              {confirmingProposalId === message.proposal.id ? (
                                <>
                                  <span className="ai-proposal-spinner" />
                                  Menyimpan...
                                </>
                              ) : message.proposal.result ? (
                                <>
                                  <Check size={15} /> Draft tersimpan
                                </>
                              ) : (
                                "Konfirmasi simpan draft"
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                      {message.clarification && (
                        <section className="ai-clarification-card">
                          <div>
                            <Info size={18} />
                            <span>
                              <strong>
                                Data “{message.clarification.name}”
                              </strong>
                              <small>
                                Pilih formulir yang ingin digunakan.
                              </small>
                            </span>
                          </div>
                          <div className="ai-clarification-options">
                            {message.clarification.options.map((option) => (
                              <button
                                type="button"
                                className="button secondary compact"
                                disabled={pending}
                                key={option.prompt}
                                onClick={() => void send(option.prompt)}
                              >
                                {option.label}
                                <ArrowRight size={14} />
                              </button>
                            ))}
                          </div>
                        </section>
                      )}
                      {message.inputTask && (
                        <AiInputTaskCard
                          message={message}
                          task={message.inputTask}
                          busy={inputTaskInProgressId === message.inputTask.id}
                          error={inputTaskErrors[message.inputTask.id]}
                          onPrepare={prepareInputTask}
                          onConfirm={confirmInputTask}
                        />
                      )}
                      {!!message.tasks?.length && (
                        <div className="ai-task-list">
                          {message.tasks.map((task) => (
                            <section
                              className={`ai-task-card ${task.status === "completed" ? "is-completed" : ""}`}
                              key={task.id}
                            >
                              <div className="ai-task-heading">
                                <span className="ai-task-icon">
                                  <ClipboardCheck size={18} />
                                </span>
                                <div>
                                  <span>
                                    {task.kind === "purchase"
                                      ? "PERSETUJUAN PEMBELIAN"
                                      : "PERSETUJUAN STOK"}
                                  </span>
                                  <strong>{task.title}</strong>
                                </div>
                                <span
                                  className={`ai-task-status ${task.canApprove ? "allowed" : "restricted"}`}
                                >
                                  {task.status === "completed" ? (
                                    <>
                                      <Check size={12} /> Selesai
                                    </>
                                  ) : task.canApprove ? (
                                    "Siap ditinjau"
                                  ) : (
                                    "Perlu approver"
                                  )}
                                </span>
                              </div>
                              <div className="ai-task-context">
                                <div>
                                  <span>Outlet</span>
                                  <strong>{outletName(task.outletId)}</strong>
                                </div>
                                <div>
                                  <span>Keterangan</span>
                                  <strong>{task.description}</strong>
                                </div>
                              </div>
                              <div className="ai-task-lines">
                                {task.lines.map((line, index) => (
                                  <div key={`${task.id}-${index}`}>
                                    <span>
                                      <strong>{line.label}</strong>
                                      <small>{line.caption}</small>
                                    </span>
                                    <b>{line.value}</b>
                                  </div>
                                ))}
                              </div>
                              {taskErrors[task.id] && (
                                <p className="ai-proposal-error" role="alert">
                                  {taskErrors[task.id]}
                                </p>
                              )}
                              <div className="ai-task-actions">
                                <div>
                                  <span>
                                    <ShieldCheck size={12} />{" "}
                                    {task.requiredRole}
                                  </span>
                                  <Link href={task.targetHref}>
                                    Buka halaman sumber{" "}
                                    <ArrowUpRight size={12} />
                                  </Link>
                                </div>
                                <button
                                  className="button primary compact"
                                  disabled={
                                    !task.canApprove ||
                                    task.status === "completed" ||
                                    taskInProgressId === task.id
                                  }
                                  onClick={() => void confirmTask(task)}
                                >
                                  {taskInProgressId === task.id ? (
                                    <>
                                      <span className="ai-proposal-spinner" />
                                      Memproses...
                                    </>
                                  ) : task.status === "completed" ? (
                                    <>
                                      <Check size={15} /> Sudah disetujui
                                    </>
                                  ) : task.kind === "purchase" ? (
                                    "Konfirmasi persetujuan PO"
                                  ) : (
                                    "Konfirmasi & terapkan opname"
                                  )}
                                </button>
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
                      {message.kind === "sales" && (
                        <>
                          <div className="answer-metrics">
                            <div>
                              <span>Penjualan bersih</span>
                              <strong>{money(summary.sales)}</strong>
                            </div>
                            <div>
                              <span>Transaksi</span>
                              <strong>{number(summary.count)}</strong>
                            </div>
                            <div>
                              <span>Laba kotor</span>
                              <strong>{money(summary.grossProfit)}</strong>
                            </div>
                          </div>
                          <p className="answer-paragraph">
                            Produk dengan nilai penjualan tertinggi adalah{" "}
                            <strong>{top[0].name}</strong>, terjual{" "}
                            {number(top[0].units)} unit senilai{" "}
                            {money(top[0].revenue)}. Rata-rata belanja pelanggan{" "}
                            {money(summary.basket)} per transaksi, sebelum
                            pengurang refund.
                          </p>
                          <div className="answer-tip">
                            <TrendingUp size={17} />
                            <span>
                              {low.length > 0
                                ? `${low.length} stok produk perlu perhatian. Tinjau kebutuhan restock agar produk favorit tetap tersedia.`
                                : "Stok pada outlet ini masih dapat dipantau dari dashboard."}
                            </span>
                          </div>
                        </>
                      )}
                      {message.kind === "stock" && (
                        <>
                          <div className="table-scroll answer-table">
                            <table>
                              <thead>
                                <tr>
                                  <th>Produk / outlet</th>
                                  <th>Stok</th>
                                  <th>Usulan</th>
                                </tr>
                              </thead>
                              <tbody>
                                {low.map((item) => (
                                  <tr key={`${item.productId}-${item.outlet}`}>
                                    <td>
                                      <strong>{item.product.name}</strong>
                                      <small>{outletName(item.outlet)}</small>
                                    </td>
                                    <td>
                                      <span
                                        className={
                                          item.stock === 0 ? "text-danger" : ""
                                        }
                                      >
                                        {item.stock} unit
                                      </span>
                                    </td>
                                    <td>
                                      <strong>+{item.recommended} unit</strong>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <details className="calculation-details">
                            <summary>
                              Bagaimana rekomendasi dihitung?
                              <ChevronDown size={14} />
                            </summary>
                            <p>
                              Target = pembulatan ke atas dari penjualan harian
                              × (lead time + 7 hari) + stok pengaman. Usulan =
                              maksimum 0, target − stok sekarang − PO disetujui
                              yang belum diterima.
                            </p>
                            {low.map((row) => (
                              <p key={`${row.productId}-${row.outlet}`}>
                                <strong>
                                  {row.product.name} · {outletName(row.outlet)}
                                </strong>
                                <br />
                                {row.daily} unit/hari × ({row.lead} + 7 hari) +{" "}
                                {row.safety} − {row.stock} stok − {row.incoming}{" "}
                                PO = <strong>{row.recommended} unit</strong>.
                              </p>
                            ))}
                            <p>
                              Observasi 28 hari (15 Agu–11 Sep 2026). Belum
                              memperhitungkan musim atau promosi. Penjualan saat
                              stok habis dapat lebih rendah daripada permintaan.
                            </p>
                          </details>
                          <button
                            className="button secondary compact"
                            onClick={() =>
                              send(
                                "Buatkan draft PO untuk produk yang perlu direstock.",
                              )
                            }
                            disabled={pending || used >= quota}
                          >
                            <FileText size={15} />
                            Siapkan draft pembelian <ArrowRight size={14} />
                          </button>
                        </>
                      )}
                      {(message.kind === "po" ||
                        message.kind === "correction") && (
                        <div className="action-preview">
                          <div>
                            <span className="action-document">
                              <FileText size={23} />
                            </span>
                            <div>
                              <strong>
                                {message.kind === "po"
                                  ? "Usulan purchase order"
                                  : "Usulan koreksi stok"}
                              </strong>
                              <p>
                                {message.confirmed
                                  ? "Disimpan di workspace · Demo"
                                  : "Menunggu tinjauan Anda · Demo"}
                              </p>
                            </div>
                            {message.confirmed && (
                              <Check size={19} className="text-success" />
                            )}
                          </div>
                          {!message.confirmed ? (
                            <button
                              className="button primary compact"
                              disabled={pending}
                              onClick={() => openAction(message)}
                            >
                              Tinjau{" "}
                              {message.kind === "po" ? "draft PO" : "koreksi"}
                              <ArrowUpRight size={15} />
                            </button>
                          ) : (
                            <div className="saved-caption">
                              <p>
                                {message.kind === "po"
                                  ? "Draft tersedia di halaman Pembelian untuk ditinjau dan disetujui. Tidak ada pesanan dikirim."
                                  : "Usulan tersedia di Inventori → Stok opname. Saldo berubah setelah persetujuan di sana."}
                              </p>
                              <button
                                className="button secondary compact"
                                disabled={pending}
                                onClick={() => openAction(message)}
                              >
                                Lihat rincian <ArrowUpRight size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {message.role === "assistant" && (
                        <div className="message-tools">
                          <button
                            className="source-button"
                            onClick={() =>
                              setSourceOpen(
                                sourceOpen === message.id ? null : message.id,
                              )
                            }
                            aria-expanded={sourceOpen === message.id}
                          >
                            <FileText size={13} />
                            Sumber data
                            <ChevronDown size={12} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Salin jawaban"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  message.text,
                                );
                                notify("Jawaban disalin.");
                              } catch {
                                notify(
                                  "Tidak dapat menyalin. Pilih teks jawaban untuk menyalinnya.",
                                );
                              }
                            }}
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      )}
                      {sourceOpen === message.id && (
                        <div className="source-detail">
                          <strong>
                            {message.tasks?.length
                              ? "Antrean tugas bisnis langsung"
                              : message.source
                                ? "Database usaha langsung"
                                : message.kind === "pricing"
                                  ? "Paket Nusa · PRD bagian 15.1"
                                  : message.kind === "stock" ||
                                      message.kind === "po" ||
                                      message.kind === "correction"
                                    ? "Snapshot persediaan & PO contoh"
                                    : "Ringkasan penjualan contoh"}
                          </strong>
                          <span>
                            {outletName(message.source?.outlet || outlet)} ·{" "}
                            {message.source
                              ? `${message.source.periodDays} hari`
                              : periodLabel(period)}
                          </span>
                          <span>
                            Diperbarui{" "}
                            {message.source
                              ? `${new Date(message.source.asOf).toLocaleString("id-ID", { timeZone: message.source.timezone })} WIB`
                              : asOf}
                          </span>
                          <p>
                            {message.inputTask
                              ? "Form mengikuti struktur data aplikasi. Nilai diperiksa server dan hanya Owner / Business Owner yang dapat mengonfirmasi penyimpanan."
                              : message.tasks?.length
                                ? "Tugas diambil dari workspace aktif sesuai role dan akses outlet. Tombol persetujuan memanggil command bisnis yang memeriksa ulang status, versi data, dan izin sebelum melakukan perubahan."
                                : message.source
                                  ? "Data diambil dari workspace aktif. Penjualan disajikan setelah refund; saran stok memakai saldo, laju penjualan, lead time, stok pengaman, dan PO yang belum diterima."
                                  : message.kind === "pricing"
                                    ? "Batas paket mengikuti PRD. Harga bersifat ilustratif; pemilihan paket tidak memproses pembayaran atau mengubah langganan."
                                    : "Data simulasi lokal. Penjualan sebelum pajak; laba kotor = penjualan bersih − HPP. Insight menjelaskan kontribusi yang terlihat, bukan penyebab di luar data."}
                          </p>
                          <Link
                            href={
                              message.inputTask?.targetHref ||
                              message.tasks?.[0]?.targetHref ||
                              (message.kind === "pricing"
                                ? "/pricing"
                                : "/dashboard")
                            }
                          >
                            {message.inputTask
                              ? "Buka halaman data"
                              : message.tasks?.length
                                ? "Buka halaman tugas"
                                : message.kind === "pricing"
                                  ? "Bandingkan paket"
                                  : "Buka dashboard sumber"}{" "}
                            <ArrowUpRight size={12} />
                          </Link>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
                {pending && (
                  <div className="message assistant">
                    <span className="message-avatar">
                      <Sparkles size={18} />
                    </span>
                    <div className="thinking" role="status">
                      <span />
                      <span />
                      <span />
                      <p>Nusa sedang melihat data Anda...</p>
                    </div>
                  </div>
                )}
                <div ref={bottom} />
              </div>
            )}
          </div>
          {openTaskCount > 0 && (
            <div className="ai-task-queue" role="status">
              <ClipboardCheck size={15} />
              <span>
                <strong>{openTaskCount} tugas menunggu keputusan</strong>
                <small>
                  Persetujuan dijalankan sesuai role dan outlet Anda.
                </small>
              </span>
            </div>
          )}
          <form
            className="composer-area"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="composer">
              <label
                htmlFor={compact ? "floating-chat-input" : "chat-input"}
                className="sr-only"
              >
                Pertanyaan untuk Nusa AI
              </label>
              <textarea
                ref={textarea}
                id={compact ? "floating-chat-input" : "chat-input"}
                rows={2}
                value={input}
                maxLength={2000}
                placeholder={
                  !business.remote?.tenant
                    ? "Masuk ke ruang kerja untuk menggunakan AI."
                    : used >= quota
                      ? "Kuota  telah habis."
                      : "Tanya apa saja tentang usaha Anda..."
                }
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={pending || used >= quota}
              />
              <div className="composer-bottom">
                <span className="composer-context">
                  <Store size={13} />
                  {outletName(outlet)}
                  <span>·</span>
                  {periodLabel(period)}
                </span>
                <button
                  className="send-button"
                  type="submit"
                  aria-label="Kirim pesan"
                  disabled={!input.trim() || pending || used >= quota}
                >
                  <ArrowUp size={20} />
                </button>
              </div>
            </div>
            <div className="composer-foot">
              <span>
                <Info size={12} />
                Jawaban berdasarkan data usaha. Tinjau sebelum bertindak.
              </span>
              <span>Enter untuk kirim</span>
            </div>
          </form>
        </section>
        <aside className="ai-side">
          <section className="context-panel">
            <div className="context-title">
              <span>
                <Store size={16} />
                Konteks bisnis
              </span>
              <span className="context-live">
                {business.remote?.tenant ? "TERHUBUNG" : "BELUM MASUK"}
              </span>
            </div>
            <div className="context-business">
              <span className="context-store-icon">
                <Store size={22} />
              </span>
              <div>
                <strong>{business.settings.name}</strong>
                <span>{outletName(outlet)}</span>
              </div>
            </div>
            <div className="context-period">
              <span>Periode analisis</span>
              <PeriodSelect />
            </div>
            <div className="context-metrics">
              <div>
                <span>Penjualan bersih</span>
                <strong>{money(summary.sales)}</strong>
              </div>
              <div>
                <span>Transaksi</span>
                <strong>{number(summary.count)}</strong>
              </div>
              <div>
                <span>Stok menipis</span>
                <strong className="text-orange">
                  {low.length} produk / outlet
                </strong>
              </div>
            </div>
            <div className="context-note">
              <Info size={13} />
              <span>
                Pergantian outlet atau periode memulai sesi percakapan baru.
              </span>
            </div>
          </section>
          <section className="history-panel">
            <div className="panel-heading">
              <h2>Riwayat percakapan</h2>
              <History size={16} />
            </div>
            <div className="history-day">SESI INI</div>
            {conversations.length ? (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className={`history-item ${conversation.id === activeId ? "active" : ""}`}
                  disabled={pending}
                  onClick={() => {
                    setActiveId(conversation.id);
                    setMessages(conversation.messages);
                    setInput("");
                  }}
                >
                  <MessageSquare size={15} />
                  <span>{conversation.title}</span>
                </button>
              ))
            ) : (
              <div className="history-empty">
                <MessageSquare size={22} />
                <p>
                  Ide pertama dimulai
                  <br />
                  dari satu pertanyaan.
                </p>
              </div>
            )}
            <div className="history-note">
              <ShieldCheck size={12} />
              Privat untuk Anda · Tersimpan selama sesi
            </div>
          </section>
          <div className="ai-help-card">
            <span className="help-spark">
              <Sparkles size={18} />
            </span>
            <strong>Semakin spesifik, semakin membantu.</strong>
            <p>
              Coba: “Buat draft PO 24 susu” atau “Stok fisik kopi ternyata 18”.
            </p>
          </div>
        </aside>
      </div>
      <Modal
        title="Riwayat percakapan"
        description="Percakapan privat dalam sesi dan konteks yang aktif."
        open={showHistory}
        onOpenChange={setShowHistory}
      >
        {conversations.length ? (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              className="history-item"
              disabled={pending}
              onClick={() => {
                setActiveId(conversation.id);
                setMessages(conversation.messages);
                setShowHistory(false);
              }}
            >
              <MessageSquare size={16} />
              <span>{conversation.title}</span>
            </button>
          ))
        ) : (
          <p className="table-empty">
            Belum ada percakapan. Mulai dengan satu pertanyaan.
          </p>
        )}
      </Modal>
      <Modal
        title={
          action?.kind === "correction"
            ? "Tinjau usulan koreksi stok"
            : "Tinjau draft purchase order"
        }
        description="Preview  · Periksa rincian sebelum mengonfirmasi."
        open={!!action}
        onOpenChange={() => setAction(null)}
        wide
      >
        <form onSubmit={confirmAction}>
          <div className="action-form-heading">
            <label>
              Outlet tujuan
              <select
                value={actionOutlet}
                onChange={(e) => setActionOutlet(e.target.value as string)}
                disabled={outlet !== "all" || action?.confirmed}
              >
                <option value="dago">Outlet Dago</option>
                <option value="cihampelas">Outlet Cihampelas</option>
                <option value="buah-batu">Outlet Buah Batu</option>
              </select>
            </label>
            <div>
              <span>
                {action?.kind === "correction" ? "Pengusul" : "Supplier"}
              </span>
              <strong>
                {action?.kind === "correction"
                  ? "Andi Pratama · Pemilik"
                  : "PT Sumber Pangan"}
              </strong>
            </div>
          </div>
          {action?.kind === "correction" ? (
            <>
              <h3 className="correction-product">{actionProduct?.name}</h3>
              <div className="correction-numbers">
                <div>
                  <span>Stok sistem</span>
                  <strong>{systemStock}</strong>
                </div>
                <ArrowRight size={20} />
                <div>
                  <span>Hitungan fisik</span>
                  <strong>{physicalStock}</strong>
                </div>
                <div>
                  <span>Selisih</span>
                  <strong>
                    {physicalStock - systemStock > 0 ? "+" : ""}
                    {physicalStock - systemStock}
                  </strong>
                </div>
              </div>
              <label className="form-label">
                Alasan koreksi
                <textarea
                  required
                  minLength={5}
                  readOnly={action?.confirmed}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: penghitungan ulang rak dan gudang"
                  rows={3}
                />
              </label>
            </>
          ) : (
            <>
              <div className="table-scroll">
                <table className="products-table">
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th>Jumlah</th>
                      <th>Biaya / unit</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderRows.map((row) => (
                      <tr key={row.product.id}>
                        <td>
                          <strong>{row.product.name}</strong>
                          <small className="table-small">
                            {row.product.variant}
                          </small>
                        </td>
                        <td>{row.qty} unit</td>
                        <td>{money(row.product.cost)}</td>
                        <td>{money(row.qty * row.product.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="order-total">
                <span>Estimasi total</span>
                <strong>{money(orderTotal)}</strong>
              </div>
            </>
          )}
          <div className="info-note">
            <ShieldCheck size={17} />
            <span>
              {action?.kind === "correction"
                ? "Konfirmasi menyimpan usulan simulasi. Saldo stok tidak berubah."
                : "Konfirmasi menyimpan draft simulasi. Pesanan belum disetujui atau dikirim dan stok tidak bertambah."}
            </span>
          </div>
          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setAction(null)}
            >
              {action?.confirmed ? "Tutup" : "Batal"}
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={action?.confirmed}
            >
              <Check size={16} />
              {action?.confirmed
                ? "Sudah disimpan"
                : action?.kind === "correction"
                  ? "Konfirmasi usulan "
                  : "Simpan draft "}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
