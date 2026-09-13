import { ApprovalPanel } from "@/components/backend-panels";
import { TransactionsPage } from "@/components/operations/transactions";
export default function Page() {
  return <><ApprovalPanel kind="refunds" /><TransactionsPage /></>;
}
