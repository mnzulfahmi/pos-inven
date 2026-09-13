import type { Metadata } from "next";
import { Pricing } from "@/components/pricing";
export const metadata: Metadata = { title: "Paket & langganan" };
export default function Page() {
  return <Pricing />;
}
