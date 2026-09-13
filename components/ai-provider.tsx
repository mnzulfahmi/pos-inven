"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { type Conversation, type Message } from "@/lib/demo-agent";
import { useBusiness } from "./business-provider";
import { useWorkspace } from "./workspace-context";
import {
  approvalTaskRequestFor,
  buildApprovalTasks,
  proposalReviewRequest,
  type AiApprovalTask,
} from "@/lib/ai-tasks";

function useSessionState() {
  const { state: business, refresh } = useBusiness();
  const { outlet, period, used, setUsed, notify } = useWorkspace();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("new");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [taskInProgressId, setTaskInProgressId] = useState<string | null>(null);
  const [taskErrors, setTaskErrors] = useState<Record<string, string>>({});
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionKey = business.remote?.tenant?.id
    ? `nusa:ai-task:${business.remote.tenant.id}:${outlet}:${period}`
    : "";
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function saveLocalReply(
    conversationId: string,
    currentMessages: Message[],
    reply: Message,
  ) {
    const finished = [...currentMessages, reply];
    setMessages(finished);
    setConversations((items) => [
      {
        id: conversationId,
        title: currentMessages[0].text,
        messages: finished,
        local: true,
      },
      ...items.filter((conversation) => conversation.id !== conversationId),
    ]);
  }
  async function send(value = input) {
    const text = value.trim().slice(0, 2000);
    if (!text || busy.current) return;
    busy.current = true;
    const id = activeId === "new" ? crypto.randomUUID() : activeId;
    const next: Message[] = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", text },
    ];
    setActiveId(id);
    setMessages(next);
    setInput("");
    const latestProposal = [...messages]
      .reverse()
      .find((message) => message.proposal && !message.proposal.result);
    if (latestProposal?.proposal && proposalReviewRequest(text)) {
      saveLocalReply(id, next, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Saya menemukan usulan yang masih menunggu. Periksa kembali rinciannya, lalu gunakan tombol konfirmasi pada kartu ini. Pesan chat saja belum menjalankan perubahan.",
        proposal: latestProposal.proposal,
      });
      busy.current = false;
      return;
    }
    const taskRequest = approvalTaskRequestFor(text);
    if (taskRequest) {
      let tasks = buildApprovalTasks(
        business.remote,
        business.products,
        business.suppliers,
        taskRequest,
      );
      const normalizedQuestion = text.toLocaleLowerCase("id-ID");
      const addressedTasks = tasks.filter(
        (task) =>
          normalizedQuestion.includes(task.id.toLocaleLowerCase("id-ID")) ||
          normalizedQuestion.includes(
            task.id.slice(0, 8).toLocaleLowerCase("id-ID"),
          ),
      );
      if (addressedTasks.length) tasks = addressedTasks;
      const canApprove = ["owner", "manager"].includes(
        String(business.remote?.role || "").toLowerCase(),
      );
      saveLocalReply(id, next, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: tasks.length
          ? canApprove
            ? `Saya menemukan ${tasks.length} tugas yang menunggu persetujuan. Tinjau rincian dan konfirmasikan tugas yang ingin dijalankan.`
            : `Saya menemukan ${tasks.length} tugas untuk ditinjau. Role Anda dapat melihat tugas ini, tetapi persetujuan memerlukan Owner atau Manager.`
          : "Tidak ada tugas yang menunggu persetujuan sesuai perintah dan akses outlet Anda.",
        source: {
          outlet,
          periodDays: Number(period),
          asOf: business.remote?.asOf || new Date().toISOString(),
          timezone: "Asia/Jakarta",
        },
        tasks,
      });
      busy.current = false;
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          conversationId: id,
          question: text,
          outletId: outlet === "all" ? null : outlet,
          period,
        }),
      });
      const reply = await response.json();
      if (!response.ok) throw new Error(reply.error);
      const finished = [...next, reply];
      setMessages(finished);
      setConversations((items) => [
        { id, title: next[0].text, messages: finished },
        ...items.filter((c) => c.id !== id),
      ]);
      setUsed((n) => n + 1);
    } catch (e) {
      setMessages([
        ...next,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: (e as Error).message,
        },
      ]);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function confirmTask(task: AiApprovalTask) {
    if (!task.canApprove || task.status === "completed" || taskInProgressId)
      return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setTaskInProgressId(task.id);
    setTaskErrors((errors) => ({ ...errors, [task.id]: "" }));
    try {
      const response = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: task.operation,
          p: task.payload,
          key: crypto.randomUUID(),
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Tugas belum dapat disetujui.");

      const completion: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text:
          task.kind === "purchase"
            ? `Selesai. Pesanan ${task.id} telah disetujui dan siap menerima barang.`
            : "Selesai. Stock opname telah disetujui dan saldo persediaan diperbarui.",
      };
      const completeTask = (items: Message[]) => {
        let found = false;
        const updated = items.map((message) => ({
          ...message,
          tasks: message.tasks?.map((item) => {
            if (item.id !== task.id) return item;
            found = true;
            return { ...item, status: "completed" as const };
          }),
        }));
        return found ? [...updated, completion] : updated;
      };
      setMessages(completeTask);
      setConversations((items) =>
        items.map((conversation) =>
          conversation.id === activeId
            ? { ...conversation, messages: completeTask(conversation.messages) }
            : conversation,
        ),
      );
      notify(
        task.kind === "purchase"
          ? "Pesanan pembelian disetujui melalui Nusa AI."
          : "Stock opname disetujui melalui Nusa AI.",
      );
      void refresh().catch(() => {
        setTaskErrors((errors) => ({
          ...errors,
          [task.id]:
            "Persetujuan berhasil, tetapi data terbaru belum termuat. Muat ulang halaman.",
        }));
      });
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "Persetujuan terlalu lama. Coba lagi; command aman untuk diulang."
          : (error as Error).message || "Tugas belum dapat disetujui.";
      setTaskErrors((errors) => ({ ...errors, [task.id]: message }));
      notify(message);
    } finally {
      window.clearTimeout(timeout);
      setTaskInProgressId(null);
    }
  }
  useEffect(() => {
    if (!sessionKey) return;
    try {
      const restored = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
      if (!restored?.id || !Array.isArray(restored.messages)) return;
      const conversation: Conversation = {
        id: restored.id,
        title: restored.title || restored.messages[0]?.text || "Tugas AI",
        messages: restored.messages,
        local: true,
      };
      setActiveId(conversation.id);
      setMessages(conversation.messages);
      setConversations((items) => [
        conversation,
        ...items.filter((item) => item.id !== conversation.id),
      ]);
    } catch {
      sessionStorage.removeItem(sessionKey);
    }
  }, [sessionKey]);
  useEffect(() => {
    if (
      !sessionKey ||
      activeId === "new" ||
      !messages.some((message) => message.tasks?.length)
    )
      return;
    sessionStorage.setItem(
      sessionKey,
      JSON.stringify({
        id: activeId,
        title: messages[0]?.text || "Tugas AI",
        messages,
      }),
    );
  }, [activeId, messages, sessionKey]);
  useEffect(() => {
    if (!business.remote?.tenant) return;
    let active = true;
    fetch("/api/ai")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (!active) return;
        const groups = new Map<string, Conversation>();
        for (const a of rows) {
          if (
            a.outlet_id !== (outlet === "all" ? null : outlet) ||
            String(a.period) !== period
          )
            continue;
          let c = groups.get(a.conversation_id);
          if (!c) {
            c = { id: a.conversation_id, title: a.question, messages: [] };
            groups.set(c.id, c);
          }
          c.messages.push({
            id: a.id + "-user",
            role: "user",
            text: a.question,
          });
          if (a.answer) {
            try {
              c.messages.push(JSON.parse(a.answer));
            } catch {}
          }
        }
        setConversations((items) => [
          ...items.filter((conversation) => conversation.local),
          ...[...groups.values()]
            .reverse()
            .filter(
              (conversation) =>
                !items.some(
                  (item) => item.local && item.id === conversation.id,
                ),
            ),
        ]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [business.remote?.tenant?.id, outlet, period]);
  function newChat() {
    if (busy.current) return;
    if (timer.current) clearTimeout(timer.current);
    busy.current = false;
    setPending(false);
    setActiveId("new");
    setMessages([]);
    setInput("");
    if (sessionKey) sessionStorage.removeItem(sessionKey);
  }
  return {
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
    send,
    newChat,
  };
}
const AiContext = createContext<ReturnType<typeof useSessionState> | null>(
  null,
);
export function AiProvider({ children }: { children: React.ReactNode }) {
  const session = useSessionState();
  return <AiContext.Provider value={session}>{children}</AiContext.Provider>;
}
export function useAiSession() {
  const session = useContext(AiContext);
  if (!session) throw new Error("AI session is required");
  return session;
}
