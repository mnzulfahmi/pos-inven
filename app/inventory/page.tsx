import { ApprovalPanel } from "@/components/backend-panels";
import { InventoryPage } from "@/components/operations/inventory";
export default function Page() {
  return <><ApprovalPanel kind="counts" /><InventoryPage /></>;
}
