# Nusa frontend

An interactive, frontend-only SaaS prototype based on `PRD.md`. Built with Next.js App Router, React, TypeScript, Radix Dialog, Lucide, and Recharts. Indonesian UI, responsive layouts, and shared dummy data.

## Run locally

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000. To check and preview the static production export:

```sh
npm run typecheck
npm run test:demo
npm run build
npm start
```

`npm start` serves the generated `out/` directory using Python 3's local static file server. Stop the development server first if it is already using port 3000.

## Pages and connected flows

| Page | Route | Demo interactions |
| --- | --- | --- |
| Dashboard | `/`, `/dashboard/` | Outlet/period filters, metrics, charts, product rankings, stock alerts, exports, AI insights |
| Sign in / registration | `/login/`, `/register/` | Example identity forms and navigation into the workspace or verification |
| Verification / recovery | `/verify-email/`, `/forgot-password/` | Explicitly simulated verification, resend, and recovery states |
| Onboarding | `/onboarding/` | Business profile → outlet/register → catalog/opening stock → first shift and sale |
| POS | `/pos/` | Search or scan SKU/barcode, category filters, cart, customer, discount, tax, payment review, 58/80 mm receipt printing |
| Transactions | `/transactions/` | Search, status filter, details, receipt, partial/full refund review, sellable-return quantities, export |
| Inventory | `/inventory/` | Product/variant editing, unique SKU/barcode, archive, CSV preview/validation/import, minimum stock, stock counts, ledger |
| Purchasing | `/purchases/` | Suppliers, multi-item PO drafts, approval, partial/full receipt, actual costs, cancellation, export |
| Customers | `/customers/` | Contact directory, add/edit profiles, purchase history and net spending |
| Reports | `/reports/` | Sales, HPP/COGS, gross/operating profit, expenses, inventory valuation, CSV exports |
| AI assistant | `/ai/` | Suggested prompts, simulated responses, shared conversation history, stock proposals and purchase drafts |
| Pricing | `/pricing/` | Starter/Pro/Business comparison, capacity checks, illustrative pricing, demo invoice requests |
| Settings | `/settings/` | Business profile, outlet registers, team invitations/status, tax/discount preferences, receipt text, invoice proof metadata |
| Operator console | `/admin/` | Separate platform-operator demo, invoice approval/rejection, capacity validation, tenant status, audit log |

The floating AI assistant is available on every page, including authentication and onboarding. Its conversation is shared with the full AI page. Sidebar modules are active links.

## Try the main user flows

1. Open **Login → Register**, simulate email verification, and complete onboarding. Choose an outlet, review the opening stock, then open the cash register shift.
2. In **POS**, add products, review a payment, and confirm it. The new transaction appears in **Transactions**, reduces **Inventory**, changes the cash balance for cash payments, and updates **Dashboard/Reports**. QRIS, card, and transfer are manually recorded simulations.
3. In **Purchasing**, create a draft PO, open its details, approve it, and receive some or all items. Receipts update stock and moving-average cost; existing sale cost snapshots stay unchanged.
4. In **Transactions**, review a refund with quantities, sellable returns, and a reason. Refunds require a shift at the original outlet. Cash refunds reduce expected cash; only sellable returns restore stock and COGS.
5. In **Inventory → Stock opname**, enter physical counts, provide a reason, review, and approve. Stale inventory versions and negative quantities are rejected.
6. Ask AI **“Buat draft PO 24 susu”** and confirm the draft. Continue with it in **Purchasing**. Ask **“Stok fisik kopi ternyata 18”**, save the proposal, then review and approve it in **Inventory → Stock opname** at the selected outlet.
7. Record operating expenses in **Reports** or other cash movements in **POS**. Close the shift by entering counted cash and explaining any discrepancy.
8. Select **Pro** on **Pricing**, open **Settings → Langganan**, and choose a sample proof file. Only its filename stays in memory. Use **Admin** to simulate verification or rejection. Approval updates the demo subscription label; it does not process payment or provision an account. The AI session retains its 100-message demo budget.

## State and data

`lib/demo-data.ts` provides historical fixtures anchored to **11 September 2026, 18:00 WIB**. The default seven-day view starts at Rp28,450,000 net sales, 286 transactions, and eight low-stock product/outlet pairs. Historical product rankings are illustrative allocations. Transaction history contains two representative historical transactions, not every transaction in the dashboard aggregate.

`lib/operations.ts` defines the local business model and calculations. `BusinessProvider` commits changes against cloned state so rejected actions leave the original state intact. Sales, stock balances, receipts, refunds, shifts, customers, suppliers, invoices, settings, and audit entries persist during client navigation and reset on reload. The POS cart is local to its page and resets when leaving it or changing outlet/period.

Money uses whole rupiah. Discounts and taxes are allocated with largest remainder; repeated partial refunds use original allocated amounts. Refunds are posted on the current demo date. Moving-average inventory cost is rounded to rupiah in this prototype. New transactions and refunds adjust the illustrative historical aggregates; historical figures are not reconstructed from the sample transaction list.

The demo supports one active shift per outlet. Registers, three outlet fixtures, role labels, pending invitations, tenant status, and subscription decisions are UI simulations. Production per-register concurrency, authentication, role enforcement, actual invitations, commercial billing, and entitlement/quota provisioning remain backend work.

AI responses use intent matching rather than an external model. The conversation survives navigation and minimizing the widget, but resets when outlet/period changes or the page reloads. The optional read-only `read_nusa_dashboard` WebMCP tool exposes the selected, updated local summary when supported by the browser.

## Verification and boundaries

`npm run test:demo` checks checkout/stock/cash integration, exact partial-refund allocation, sellable-return COGS, purchase approval and partial receiving, stale stock counts, CSV validation, shift reconciliation, new-outlet setup, and cost snapshots. TypeScript and the static Next.js production build validate the page tree.

There are **no API routes, server actions, database, actual authentication, external AI calls, payment processing, uploads, emails, or backend services**. No deployment is included. Use example data only; reloading restores the initial fixtures.
