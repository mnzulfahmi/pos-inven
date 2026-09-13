import type { Metadata } from "next";
import { AiChat } from "@/components/ai-chat";
export const metadata: Metadata = { title: "AI Assistant" };
export default function Page() {
  return <AiChat />;
}
