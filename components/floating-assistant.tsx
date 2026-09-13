"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Minus, Plus, Sparkles } from "lucide-react";
import { AiChat } from "./ai-chat";
import { useAiSession } from "./ai-provider";
import { useWorkspace } from "./workspace-context";

export function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  const { newChat, pending } = useAiSession();
  const { used, quota } = useWorkspace();
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("nusa:open-assistant", show);
    return () => window.removeEventListener("nusa:open-assistant", show);
  }, []);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          ref={launcher}
          className="ai-launcher"
          aria-label="Buka chatbot Nusa AI"
        >
          <Sparkles size={21} />
          <span>Tanya Nusa AI</span>
          {pending && <i aria-label="Menyiapkan jawaban" />}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="floating-chat-overlay" />
        <Dialog.Content
          className="floating-chat-window"
          aria-describedby="floating-chat-description"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById("floating-chat-input")?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            launcher.current?.focus();
          }}
        >
          <div className="floating-chat-heading">
            <span className="floating-chat-mark">
              <Sparkles size={23} />
            </span>
            <div>
              <Dialog.Title>Nusa AI</Dialog.Title>
              <Dialog.Description id="floating-chat-description">
                Asisten usaha Anda
              </Dialog.Description>
            </div>
            <div className="floating-chat-controls">
              <button
                className="icon-button"
                aria-label="Mulai chat baru"
                title="Chat baru"
                onClick={newChat}
              >
                <Plus size={18} />
              </button>
              <Link
                className="icon-button"
                aria-label="Buka halaman AI Assistant"
                title="Buka halaman AI Assistant"
                href="/ai"
                onClick={() => setOpen(false)}
              >
                <ArrowUpRight size={18} />
              </Link>
              <Dialog.Close
                className="icon-button"
                aria-label="Minimalkan chatbot"
                title="Minimalkan"
              >
                <Minus size={19} />
              </Dialog.Close>
            </div>
          </div>
          <div className="floating-chat-body">
            <AiChat compact />
          </div>
          <div className="floating-chat-foot">
            <span>
              <Sparkles size={12} />
              {Math.max(0, quota - used)} pesan tersisa
            </span>
            <Link href="/pricing" onClick={() => setOpen(false)}>
              Lihat paket <ArrowUpRight size={12} />
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
