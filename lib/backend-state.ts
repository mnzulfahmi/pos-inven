import type { BusinessState } from "./operations";
type Row = Record<string, any>;
export const emptyBusiness = (): BusinessState => ({
  products: [],
  balances: [],
  sales: [],
  purchases: [],
  shifts: [],
  customers: [],
  suppliers: [],
  ledger: [],
  refunds: [],
  expenses: [],
  audit: [],
  invoices: [],
  proposals: [],
  members: [],
  registers: [],
  settings: { name: "Nusa", address: "", tax: 0, discount: 0, receipt: "" },
  subscription: "",
  tenantStatus: "Aktif",
  onboarded: false,
  remote: {},
});
export function mapBusiness(r: Row): BusinessState {
  const s = emptyBusiness();
  s.remote = r;
  const roles: Row = {
    owner: "Owner",
    manager: "Manager",
    cashier: "Cashier",
    inventory: "Inventory",
  };
  s.settings = {
    name: r.tenant.name,
    address: r.tenant.address,
    tax: Number(r.tenant.tax_rate),
    discount: Number(r.tenant.discount_limit),
    receipt: r.tenant.receipt_footer,
  };
  s.onboarded = r.tenant.onboarded;
  s.tenantStatus = r.tenant.status === "active" ? "Aktif" : "Ditangguhkan";
  s.subscription =
    (r.subscription.status === "trial" ? "Trial " : "") +
    r.subscription.plan.name;
  s.products = r.products.map((p: Row) => ({
    id: p.id,
    name: p.product_name,
    variant: p.name,
    sku: p.sku,
    barcode: p.barcode || "",
    category: p.category || "Lainnya",
    price: Number(p.price),
    cost: Number(p.initial_cost || 0),
    color: "blue",
    icon: "bottle",
    share: 0,
    archived: !p.active,
    imageFileId: r.productImages?.[p.id] || "",
    image: r.productImages?.[p.id]
      ? `/api/files/${r.productImages[p.id]}?view=1`
      : "",
  }));
  s.balances = r.balances.map((b: Row) => ({
    productId: b.variant_id,
    outlet: b.outlet_id,
    stock: Number(b.quantity),
    cost: Number(b.unit_cost || 0),
    minimum: Number(b.minimum),
    version: Number(b.version),
  }));
  s.sales = r.sales.map((a: Row) => ({
    id: a.id,
    outlet: a.outlet_id,
    date: a.posted_at,
    customer: a.customer_id || "",
    method: a.payment.method,
    subtotal: Number(a.subtotal),
    discount: Number(a.discount),
    tax: Number(a.tax),
    total: Number(a.total),
    cash: Number(a.payment.tendered),
    shift: a.shift_id,
    lines: a.lines.map((l: Row) => ({
      productId: l.variant_id,
      name: l.name,
      quantity: Number(l.quantity),
      price: Number(l.price),
      cost: Number(l.unit_cost || 0),
      net: Number(l.net),
      tax: Number(l.tax),
      refunded: Number(l.refunded),
    })),
  }));
  s.shifts = r.shifts.map((a: Row) => ({
    id: a.id,
    outlet: a.outlet_id,
    opening: Number(a.opening_cash),
    expected: Number(a.expected),
    closed: !!a.closed_at,
    counted: a.counted_cash == null ? undefined : Number(a.counted_cash),
    reason: a.reason,
  }));
  s.purchases = r.purchases.map((a: Row) => ({
    id: a.id,
    outlet: a.outlet_id,
    supplier: a.supplier_id,
    status: (
      {
        draft: "Draft",
        approved: "Disetujui",
        partial: "Diterima sebagian",
        received: "Selesai",
        cancelled: "Dibatalkan",
      } as Row
    )[a.status],
    lines: (a.lines || []).map((l: Row) => ({
      productId: l.variant_id,
      quantity: Number(l.quantity),
      received: Number(l.received),
      cost: Number(l.cost),
    })),
  }));
  s.customers = r.customers;
  s.suppliers = r.suppliers;
  s.ledger = r.ledger.map((a: Row) => ({
    id: a.id,
    outlet: a.outlet_id,
    productId: a.variant_id,
    delta: Number(a.delta),
    after: Number(a.balance_after),
    reason: a.reason,
  }));
  s.refunds = r.refunds
    .filter((a: Row) => a.status === "posted")
    .map((a: Row) => ({
      id: a.id,
      sale: a.sale_id,
      outlet: a.outlet_id,
      amount: Number(a.total),
      net: Number(a.net),
      cost: Number(a.cost || 0),
      reason: a.reason,
    }));
  s.expenses = r.expenses.map((a: Row) => ({
    id: a.id,
    outlet: a.outlet_id,
    category: a.category,
    amount: Number(a.amount),
    method: a.method,
    note: a.note,
  }));
  s.audit = r.audit.map((a: Row) => ({
    id: a.id,
    action: a.action + (a.reason ? " · " + a.reason : ""),
  }));
  s.invoices = r.invoices.map((a: Row) => ({
    id: a.id,
    plan: a.plan_id.split("-")[0].replace(/^./, (x: string) => x.toUpperCase()),
    amount: Number(a.amount),
    status: (
      {
        awaiting_proof: "Menunggu bukti",
        awaiting_payment: "Menunggu pembayaran",
        pending: "Menunggu verifikasi",
        approved: "Disetujui",
        rejected: "Ditolak",
        scheduled: "Dijadwalkan",
      } as Row
    )[a.status],
    proof: a.proof_file_id || "",
    reason: a.reason,
    provider: a.provider || "manual",
    paymentUrl: a.payment_url || "",
    expiresAt: a.expires_at || "",
  }));
  s.members = r.members.map((a: Row) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: roles[a.role],
    outlet: a.outlet_ids?.[0] || r.outlets[0]?.id || "all",
    status: a.active ? "Aktif" : "Nonaktif",
  }));
  s.members.push(
    ...r.invitations
      .filter((a: Row) => !a.accepted_at && !a.revoked_at)
      .map((a: Row) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        role: roles[a.role],
        outlet: "all",
        status: "Menunggu",
      })),
  );
  s.registers = r.registers.map((a: Row) => ({
    id: a.id,
    name: a.name,
    outlet: a.outlet_id,
    active: a.active,
  }));
  return s;
}
const retryKeys = new Map<string, string>();
export async function api(op: string, p: Row = {}, key?: string) {
  const fingerprint = JSON.stringify({ op, p });
  const k = key || retryKeys.get(fingerprint) || crypto.randomUUID();
  retryKeys.set(fingerprint, k);
  const response = await fetch("/api/business", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, p, key: k }),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Permintaan gagal"), {
      status: response.status,
    });
  retryKeys.delete(fingerprint);
  return data;
}
const diff = (a: unknown, b: unknown) =>
  JSON.stringify(a) !== JSON.stringify(b);
const pendingCheckouts = new Map<string, Row>();
// Translate existing form intents into narrow domain commands. No client ledger,
// price calculation, permission, or balance is ever persisted directly.
export async function saveIntent(before: BusinessState, after: BusinessState) {
  const raw = before.remote!;
  let result: Row = {};
  const audit =
    after.audit.find((a) => !before.audit.some((b) => a.id === b.id))?.action ||
    "Perubahan melalui formulir";
  const cmd = async (op: string, p: Row) => {
    result = await api(op, p);
    return result;
  };
  if (diff(before.settings, after.settings))
    await cmd("settings", after.settings);
  const newProducts = after.products.filter(
    (p) => !before.products.some((b) => b.id === p.id),
  );
  if (newProducts.length > 1) {
    await cmd("import-products", {
      products: newProducts.map(({ id: _id, ...p }) => p),
    });
  }
  for (const p of after.products.filter(
    (p) =>
      !(newProducts.length > 1 && newProducts.some((n) => n.id === p.id)) &&
      (!before.products.some((b) => b.id === p.id && !diff(b, p)) ||
        after.balances.some(
          (b) =>
            b.productId === p.id &&
            !before.balances.some(
              (a) =>
                a.productId === b.productId &&
                a.outlet === b.outlet &&
                a.minimum === b.minimum,
            ),
        )),
  )) {
    const changed = after.balances.find(
      (b) =>
        b.productId === p.id &&
        !before.balances.some(
          (a) =>
            a.productId === b.productId &&
            a.outlet === b.outlet &&
            a.minimum === b.minimum,
        ),
    );
    const saved = await cmd("save-product", {
      ...p,
      id: before.products.some((b) => b.id === p.id) ? p.id : undefined,
      outletId: changed?.outlet,
      minimum: changed?.minimum,
    });
    const previous = before.products.find((item) => item.id === p.id);
    if ((previous?.imageFileId || "") !== (p.imageFileId || ""))
      await cmd("set-product-image", {
        variantId: previous ? p.id : saved.id,
        fileId: p.imageFileId || null,
      });
  }
  for (const [field, op] of [
    ["customers", "save-customer"],
    ["suppliers", "save-supplier"],
    ["registers", "save-register"],
  ] as const)
    for (const p of after[field]) {
      const old = before[field].find((b) => b.id === p.id);
      if (!old || diff(old, p))
        await cmd(op, {
          ...p,
          id: old ? p.id : undefined,
          outletId: "outlet" in p ? p.outlet : undefined,
        });
    }
  for (const s of after.shifts.filter(
    (a) => !before.shifts.some((b) => a.id === b.id),
  ))
    await cmd("open-shift", {
      outletId: s.outlet,
      registerId: before.registers.find(
        (r) => r.active && r.outlet === s.outlet,
      )?.id,
      amount: s.opening,
    });
  for (const sale of after.sales.filter(
    (a) => !before.sales.some((b) => a.id === b.id),
  )) {
    const p = {
      outletId: sale.outlet,
      shiftId: sale.shift,
      items: sale.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
      })),
      discount: sale.discount,
      method: sale.method,
      cash: sale.cash,
      customerId: sale.customer,
      manualConfirmed: true,
    };
    const intent = JSON.stringify(p);
    let prepared = pendingCheckouts.get(intent);
    if (!prepared) {
      const q = await api("quote", p);
      if (q.total !== sale.total)
        throw new Error(
          "Harga atau pajak berubah. Muat ulang dan periksa kembali pembayaran.",
        );
      prepared = {
        ...p,
        quoteHash: q.hash,
        quoteExpires: q.expiresAt,
        quoteId: q.quoteId,
      };
      pendingCheckouts.set(intent, prepared);
    }
    try {
      await cmd("checkout", prepared);
    } catch (e) {
      // A definitive conflict needs a fresh review/quote; uncertain network failures reuse the same request.
      if ((e as { status?: number }).status === 409)
        pendingCheckouts.delete(intent);
      throw e;
    }
    pendingCheckouts.delete(intent);
    return result;
  }
  for (const refund of after.refunds.filter(
    (a) => !before.refunds.some((b) => a.id === b.id),
  )) {
    const old = before.sales.find((s) => s.id === refund.sale)!,
      next = after.sales.find((s) => s.id === refund.sale)!;
    const lines = next.lines
      .map((l, i) => ({
        itemId: raw.sales
          .find((s: Row) => s.id === old.id)
          .lines.find((x: Row) => x.variant_id === l.productId).id,
        quantity: l.refunded - old.lines[i].refunded,
        restock: after.ledger
          .filter(
            (a) =>
              !before.ledger.some((b) => a.id === b.id) &&
              a.productId === l.productId &&
              a.outlet === old.outlet,
          )
          .reduce((n, x) => n + x.delta, 0),
      }))
      .filter((l) => l.quantity > 0);
    const request = await cmd("request-refund", {
      saleId: old.id,
      reason: refund.reason,
      lines,
    });
    if (["owner", "manager"].includes(raw.role))
      await cmd("approve-refund", {
        id: request.id,
        shiftId: before.shifts.find((s) => s.outlet === old.outlet && !s.closed)
          ?.id,
        manualConfirmed: true,
      });
    return result;
  }
  for (const p of after.purchases) {
    const old = before.purchases.find((b) => b.id === p.id);
    if (!old) {
      await cmd("create-purchase", {
        outletId: p.outlet,
        supplierId: p.supplier,
        lines: p.lines,
      });
      continue;
    }
    if (!diff(old, p)) continue;
    const stored = raw.purchases.find((a: Row) => a.id === p.id);
    if (p.lines.some((l, i) => l.received > old.lines[i].received)) {
      await cmd("receive-purchase", {
        id: p.id,
        version: stored.version,
        lines: p.lines
          .map((l, i) => ({
            itemId: stored.lines.find((x: Row) => x.variant_id === l.productId)
              .id,
            quantity: l.received - old.lines[i].received,
            cost: l.cost,
          }))
          .filter((l) => l.quantity > 0),
      });
      return result;
    }
    await cmd(
      p.status === "Disetujui" ? "approve-purchase" : "cancel-purchase",
      { id: p.id, version: stored.version, reason: audit },
    );
  }
  const moves = after.ledger.filter(
    (a) => !before.ledger.some((b) => a.id === b.id),
  );
  if (moves.length) {
    const outletId = moves[0].outlet;
    const count = await cmd("create-count", {
      outletId,
      reason: audit,
      lines: moves.map((m) => ({
        productId: m.productId,
        physical: m.after,
        version:
          before.balances.find(
            (b) => b.productId === m.productId && b.outlet === outletId,
          )?.version || 0,
      })),
    });
    if (["owner", "manager"].includes(raw.role))
      await cmd("approve-count", { id: count.id });
  }
  for (const e of after.expenses.filter(
    (a) => !before.expenses.some((b) => a.id === b.id),
  ))
    await cmd("expense", {
      ...e,
      outletId: e.outlet,
      shiftId: before.shifts.find((s) => s.outlet === e.outlet && !s.closed)
        ?.id,
    });
  for (const s of after.shifts) {
    const old = before.shifts.find((a) => a.id === s.id);
    if (!old) continue;
    if (s.closed && !old.closed)
      await cmd("close-shift", {
        outletId: s.outlet,
        shiftId: s.id,
        amount: s.counted,
        reason: s.reason,
      });
    else if (
      s.expected !== old.expected &&
      after.expenses.length === before.expenses.length
    )
      await cmd("cash-movement", {
        outletId: s.outlet,
        shiftId: s.id,
        amount: s.expected - old.expected,
        reason: audit,
      });
  }
  for (const i of after.invoices.filter(
    (a) => !before.invoices.some((b) => a.id === b.id),
  ))
    await cmd("request-invoice", { planId: i.plan.toLowerCase() + "-v1" });
  for (const i of after.invoices) {
    const old = before.invoices.find((b) => b.id === i.id);
    if (old && i.proof !== old.proof)
      await cmd("attach-proof", { id: i.id, fileId: i.proof });
  }
  for (const m of after.members) {
    const old = before.members.find((a) => a.id === m.id);
    const role = m.role.toLowerCase();
    if (!old) {
      const token = crypto.randomUUID() + crypto.randomUUID();
      await cmd("invite-member", { ...m, role, token, outletIds: [m.outlet] });
      window.dispatchEvent(
        new CustomEvent("nusa:invite", {
          detail: location.origin + "/invite?token=" + token,
        }),
      );
    } else if (diff(old, m)) {
      if (old.status === "Menunggu")
        await cmd("revoke-invitation", { id: m.id });
      else
        await cmd("manage-member", {
          id: m.id,
          role,
          active: m.status === "Aktif",
          outletIds: raw.members.find((a: Row) => a.id === m.id)
            ?.outlet_ids || [m.outlet],
          version: raw.members.find((a: Row) => a.id === m.id)?.version,
        });
    }
  }
  if (after.onboarded && !before.onboarded) await cmd("finish-onboarding", {});
  return result;
}
