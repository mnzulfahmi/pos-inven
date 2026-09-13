import {
  products,
  inventory,
  getSummary,
  getTopProducts,
  type OutletId,
  type Period,
} from "./demo-data";
import { liveReport } from "./live-reports";
export type StoreId = Exclude<OutletId, "all">;
export type Product = (typeof products)[number] & {
  barcode: string;
  archived: boolean;
  image?: string;
  imageFileId?: string;
};
export type Balance = {
  productId: string;
  outlet: StoreId;
  stock: number;
  minimum: number;
  cost: number;
  version: number;
};
export type SaleLine = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  cost: number;
  net: number;
  tax: number;
  refunded: number;
};
export type Sale = {
  id: string;
  outlet: StoreId;
  date: string;
  customer: string;
  method: string;
  lines: SaleLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  cash: number;
  shift: string;
  seeded?: boolean;
};
export type Purchase = {
  id: string;
  outlet: StoreId;
  supplier: string;
  status:
    "Draft" | "Disetujui" | "Diterima sebagian" | "Selesai" | "Dibatalkan";
  lines: {
    productId: string;
    quantity: number;
    received: number;
    cost: number;
  }[];
};
export type Shift = {
  id: string;
  outlet: StoreId;
  opening: number;
  expected: number;
  closed: boolean;
  counted?: number;
  reason?: string;
};
export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  note: string;
};
export type Invoice = {
  id: string;
  plan: string;
  amount: number;
  status:
    | "Menunggu bukti"
    | "Menunggu pembayaran"
    | "Menunggu verifikasi"
    | "Disetujui"
    | "Ditolak"
    | "Dijadwalkan";
  proof: string;
  reason: string;
  provider?: "manual" | "mayar";
  paymentUrl?: string;
  expiresAt?: string;
};
export type BusinessState = {
  remote?: Record<string, any>;
  proposals: {
    id: string;
    outlet: StoreId;
    productId: string;
    physical: number;
    version: number;
    reason: string;
    status: string;
  }[];
  products: Product[];
  balances: Balance[];
  sales: Sale[];
  purchases: Purchase[];
  shifts: Shift[];
  customers: Customer[];
  suppliers: { id: string; name: string; phone: string; address: string }[];
  ledger: {
    id: string;
    outlet: StoreId;
    productId: string;
    delta: number;
    after: number;
    reason: string;
  }[];
  refunds: {
    id: string;
    sale: string;
    outlet: StoreId;
    amount: number;
    net: number;
    cost: number;
    reason: string;
  }[];
  expenses: {
    id: string;
    outlet: StoreId;
    category: string;
    amount: number;
    method: string;
    note: string;
  }[];
  audit: { id: string; action: string }[];
  invoices: Invoice[];
  settings: {
    name: string;
    address: string;
    tax: number;
    discount: number;
    receipt: string;
  };
  members: {
    id: string;
    name: string;
    email: string;
    role: string;
    outlet: StoreId;
    status: string;
  }[];
  registers: { id: string; name: string; outlet: StoreId; active: boolean }[];
  subscription: string;
  tenantStatus: string;
  onboarded: boolean;
};
export const uid = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
export const whole = (n: number, min = 0) =>
  Number.isSafeInteger(n) && n >= min && n <= 1_000_000_000;
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function initialBusiness(): BusinessState {
  return {
    proposals: [],
    products: products.map((p, i) => ({
      ...p,
      barcode: `899000000000${i + 1}`,
      archived: false,
    })),
    balances: inventory.map((b) => ({
      ...b,
      cost: products.find((p) => p.id === b.productId)!.cost,
      version: 0,
    })),
    sales: [
      {
        id: "TRX-0911-046",
        outlet: "dago",
        date: "11 Sep 2026 · 17.42",
        customer: "c1",
        method: "Tunai",
        lines: [
          {
            productId: "milk",
            name: products[0].name,
            quantity: 2,
            price: 19500,
            cost: 15000,
            net: 39000,
            tax: 0,
            refunded: 0,
          },
          {
            productId: "noodle",
            name: products[4].name,
            quantity: 3,
            price: 3500,
            cost: 2600,
            net: 10500,
            tax: 0,
            refunded: 0,
          },
        ],
        subtotal: 49500,
        discount: 0,
        tax: 0,
        total: 49500,
        cash: 50000,
        shift: "SHIFT-HIST",
        seeded: true,
      },
      {
        id: "TRX-0911-045",
        outlet: "cihampelas",
        date: "11 Sep 2026 · 17.20",
        customer: "c2",
        method: "QRIS",
        lines: [
          {
            productId: "rice",
            name: products[1].name,
            quantity: 1,
            price: 72000,
            cost: 59000,
            net: 72000,
            tax: 0,
            refunded: 0,
          },
        ],
        subtotal: 72000,
        discount: 0,
        tax: 0,
        total: 72000,
        cash: 72000,
        shift: "SHIFT-HIST-2",
        seeded: true,
      },
    ],
    purchases: [
      {
        id: "PO-0911-001",
        outlet: "dago",
        supplier: "s1",
        status: "Disetujui",
        lines: [
          { productId: "rice", quantity: 8, received: 0, cost: 59000 },
          { productId: "coffee", quantity: 12, received: 0, cost: 6500 },
        ],
      },
      {
        id: "PO-0911-002",
        outlet: "cihampelas",
        supplier: "s2",
        status: "Disetujui",
        lines: [{ productId: "oil", quantity: 6, received: 0, cost: 30000 }],
      },
    ],
    shifts: [],
    customers: [
      {
        id: "c1",
        name: "Rina Marlina",
        phone: "081200001234",
        email: "rina@example.test",
        note: "Pelanggan mingguan",
      },
      {
        id: "c2",
        name: "Budi Santoso",
        phone: "081200005678",
        email: "budi@example.test",
        note: "Kebutuhan warung",
      },
    ],
    suppliers: [
      {
        id: "s1",
        name: "PT Sumber Pangan",
        phone: "0227000123",
        address: "Jl. Soekarno Hatta, Bandung",
      },
      {
        id: "s2",
        name: "CV Mitra Niaga",
        phone: "0227000456",
        address: "Jl. Cibaduyut, Bandung",
      },
    ],
    ledger: [],
    refunds: [],
    expenses: [],
    audit: [],
    invoices: [],
    settings: {
      name: "Toko Nusantara",
      address: "Jl. Ir. H. Juanda No. 88, Bandung",
      tax: 0,
      discount: 0,
      receipt: "Terima kasih sudah berbelanja. Sampai jumpa kembali!",
    },
    members: [
      {
        id: "u1",
        name: "Andi Pratama",
        email: "andi@example.test",
        role: "Owner",
        outlet: "dago",
        status: "Aktif",
      },
      {
        id: "u2",
        name: "Sari Dewi",
        email: "sari@example.test",
        role: "Cashier",
        outlet: "dago",
        status: "Aktif",
      },
      {
        id: "u3",
        name: "Dimas Putra",
        email: "dimas@example.test",
        role: "Manager",
        outlet: "cihampelas",
        status: "Aktif",
      },
    ],
    registers: [
      { id: "r1", name: "Kasir 01", outlet: "dago", active: true },
      { id: "r2", name: "Kasir 01", outlet: "cihampelas", active: true },
    ],
    subscription: "Trial Pro",
    tenantStatus: "Aktif",
    onboarded: false,
  };
}
export function balance(
  s: BusinessState,
  outlet: StoreId,
  productId: string,
): Balance {
  return (
    s.balances.find(
      (b) => b.outlet === outlet && b.productId === productId,
    ) || {
      outlet,
      productId,
      stock: 0,
      minimum: 0,
      cost: s.products.find((p) => p.id === productId)?.cost || 0,
      version: 0,
    }
  );
}
export function activeShift(s: BusinessState, outlet: StoreId) {
  return s.shifts.find((x) => x.outlet === outlet && !x.closed);
}
export function audit(s: BusinessState, action: string) {
  s.audit.unshift({ id: uid("LOG"), action });
}
function move(
  s: BusinessState,
  outlet: StoreId,
  productId: string,
  delta: number,
  reason: string,
  cost?: number,
) {
  let b = s.balances.find(
    (b) => b.outlet === outlet && b.productId === productId,
  );
  if (!b) {
    b = balance(s, outlet, productId);
    s.balances.push(b);
  }
  requireValue(
    whole(b.stock + delta),
    "Stok tidak mencukupi. Muat ulang pratinjau.",
  );
  if (cost !== undefined && delta > 0)
    b.cost = Math.round((b.stock * b.cost + delta * cost) / (b.stock + delta));
  b.stock += delta;
  b.version++;
  s.ledger.unshift({
    id: uid("STK"),
    outlet,
    productId,
    delta,
    after: b.stock,
    reason,
  });
}
export function openShift(s: BusinessState, outlet: StoreId, opening: number) {
  requireValue(!activeShift(s, outlet), "Shift masih aktif.");
  requireValue(
    s.registers.some((r) => r.outlet === outlet && r.active),
    "Tambahkan register aktif di Pengaturan.",
  );
  requireValue(
    whole(opening),
    "Modal awal harus rupiah bulat positif atau nol.",
  );
  s.shifts.unshift({
    id: uid("SHIFT"),
    outlet,
    opening,
    expected: opening,
    closed: false,
  });
  audit(s, `Shift dibuka: ${outlet}`);
}
export function closeShift(
  s: BusinessState,
  outlet: StoreId,
  counted: number,
  reason: string,
) {
  const shift = activeShift(s, outlet);
  requireValue(shift, "Buka shift terlebih dahulu.");
  requireValue(whole(counted), "Kas fisik tidak valid.");
  requireValue(
    counted === shift.expected || reason.trim(),
    "Alasan selisih wajib diisi.",
  );
  Object.assign(shift, { closed: true, counted, reason });
  audit(s, `Shift ditutup: ${outlet}, selisih ${counted - shift.expected}`);
}
export function cashMovement(
  s: BusinessState,
  outlet: StoreId,
  amount: number,
  reason: string,
) {
  const shift = activeShift(s, outlet);
  requireValue(shift, "Buka shift terlebih dahulu.");
  requireValue(
    whole(Math.abs(amount), 1) && reason.trim(),
    "Isi nominal dan alasan.",
  );
  requireValue(shift.expected + amount >= 0, "Kas tidak mencukupi.");
  shift.expected += amount;
  audit(s, `Kas ${outlet}: ${amount}, ${reason}`);
}
export function checkout(
  s: BusinessState,
  outlet: StoreId,
  cart: { productId: string; quantity: number }[],
  discount: number,
  taxRate: number,
  method: string,
  cash: number,
  customer: string,
) {
  requireValue(
    s.tenantStatus === "Aktif",
    "Workspace sedang ditangguhkan pada simulasi admin.",
  );
  const shift = activeShift(s, outlet);
  requireValue(shift, "Buka shift sebelum menerima pembayaran.");
  requireValue(
    cart.length && new Set(cart.map((x) => x.productId)).size === cart.length,
    "Keranjang tidak valid.",
  );
  const lines: SaleLine[] = cart.map((x) => {
    const p = s.products.find((p) => p.id === x.productId && !p.archived);
    requireValue(p && whole(x.quantity, 1), "Produk atau jumlah tidak valid.");
    const b = balance(s, outlet, p.id);
    requireValue(b.stock >= x.quantity, `Stok ${p.name} tidak cukup.`);
    return {
      productId: p.id,
      name: p.name,
      quantity: x.quantity,
      price: p.price,
      cost: b.cost,
      net: p.price * x.quantity,
      tax: 0,
      refunded: 0,
    };
  });
  const subtotal = lines.reduce((a, b) => a + b.net, 0);
  requireValue(
    whole(subtotal),
    "Nilai transaksi melebihi batas demo Rp1 miliar.",
  );
  requireValue(
    whole(discount) && discount <= subtotal,
    "Diskon melebihi subtotal.",
  );
  requireValue(
    Number.isFinite(taxRate) && taxRate >= 0 && taxRate <= 100,
    "Pajak tidak valid.",
  );
  const discounts = allocateMoney(
    discount,
    lines.map((l) => ({ id: l.productId, weight: l.net })),
  );
  lines.forEach((l, i) => (l.net -= discounts[i]));
  const tax = Math.round(((subtotal - discount) * taxRate) / 100),
    total = subtotal - discount + tax;
  const taxes = allocateMoney(
    tax,
    lines.map((l) => ({ id: l.productId, weight: l.net })),
  );
  lines.forEach((l, i) => (l.tax = taxes[i]));
  requireValue(
    ["Tunai", "QRIS", "Kartu", "Transfer"].includes(method),
    "Metode pembayaran tidak valid.",
  );
  requireValue(
    whole(cash) && cash >= total,
    "Uang diterima kurang dari total.",
  );
  const sale: Sale = {
    id: uid("TRX"),
    outlet,
    date: "11 Sep 2026 · sesi demo",
    customer,
    method,
    lines,
    subtotal,
    discount,
    tax,
    total,
    cash,
    shift: shift.id,
  };
  lines.forEach((l) => move(s, outlet, l.productId, -l.quantity, sale.id));
  if (method === "Tunai") shift.expected += total;
  s.sales.unshift(sale);
  audit(s, `Penjualan ${sale.id}: ${total}`);
  return sale.id;
}
export function refund(
  s: BusinessState,
  id: string,
  quantities: number[],
  restock: number[],
  reason: string,
) {
  const sale = s.sales.find((x) => x.id === id);
  requireValue(sale, "Transaksi tidak ditemukan.");
  requireValue(reason.trim(), "Alasan refund wajib diisi.");
  requireValue(
    quantities.length === sale.lines.length &&
      restock.length === sale.lines.length,
    "Baris refund tidak valid.",
  );
  let amount = 0,
    net = 0,
    cost = 0;
  quantities.forEach((q, i) => {
    const l = sale.lines[i];
    requireValue(
      whole(q) &&
        q <= l.quantity - l.refunded &&
        whole(restock[i]) &&
        restock[i] <= q,
      "Jumlah refund atau stok kembali tidak valid.",
    );
    const unitGross = l.net + l.tax;
    amount +=
      Math.round((unitGross * (l.refunded + q)) / l.quantity) -
      Math.round((unitGross * l.refunded) / l.quantity);
    net +=
      Math.round((l.net * (l.refunded + q)) / l.quantity) -
      Math.round((l.net * l.refunded) / l.quantity);
    cost += l.cost * restock[i];
  });
  requireValue(
    quantities.some((q) => q > 0),
    "Pilih minimal satu barang.",
  );
  const shift = activeShift(s, sale.outlet);
  requireValue(shift, "Buka shift pada outlet transaksi sebelum refund.");
  if (sale.method === "Tunai") {
    requireValue(
      shift.expected >= amount,
      "Kas shift tidak mencukupi untuk refund.",
    );
    shift.expected -= amount;
  }
  sale.lines.forEach((l, i) => {
    l.refunded += quantities[i];
    if (restock[i])
      move(s, sale.outlet, l.productId, restock[i], `Refund ${id}`, l.cost);
  });
  s.refunds.unshift({
    id: uid("REF"),
    sale: id,
    outlet: sale.outlet,
    amount,
    net,
    cost,
    reason,
  });
  audit(s, `Refund ${id}: ${amount}, ${reason}`);
}
export function createPurchase(
  s: BusinessState,
  outlet: StoreId,
  supplier: string,
  lines: { productId: string; quantity: number; cost: number }[],
) {
  requireValue(outlet && outlet !== "all", "Pilih outlet tujuan.");
  requireValue(
    s.suppliers.some((x) => x.id === supplier),
    "Pilih pemasok.",
  );
  requireValue(
    lines.length &&
      new Set(lines.map((l) => l.productId)).size === lines.length,
    "Pilih produk berbeda untuk setiap baris.",
  );
  lines.forEach((l) =>
    requireValue(
      s.products.some((p) => p.id === l.productId && !p.archived) &&
        whole(l.quantity, 1) &&
        whole(l.cost),
      "Jumlah, produk, atau harga beli tidak valid.",
    ),
  );
  const id = uid("PO");
  s.purchases.unshift({
    id,
    outlet,
    supplier,
    status: "Draft",
    lines: lines.map((l) => ({ ...l, received: 0 })),
  });
  audit(s, `Draft pembelian ${id}`);
  return id;
}
export function receivePurchase(
  s: BusinessState,
  id: string,
  rows: { quantity: number; cost: number }[],
) {
  const po = s.purchases.find((p) => p.id === id);
  requireValue(
    po && ["Disetujui", "Diterima sebagian"].includes(po.status),
    "PO belum disetujui atau sudah selesai.",
  );
  requireValue(
    rows.length === po.lines.length && rows.some((r) => r.quantity > 0),
    "Isi jumlah diterima.",
  );
  rows.forEach((r, i) =>
    requireValue(
      whole(r.quantity) &&
        r.quantity <= po.lines[i].quantity - po.lines[i].received &&
        whole(r.cost),
      "Penerimaan melebihi sisa pesanan atau harga tidak valid.",
    ),
  );
  rows.forEach((r, i) => {
    if (r.quantity) {
      move(
        s,
        po.outlet,
        po.lines[i].productId,
        r.quantity,
        `Terima ${id}`,
        r.cost,
      );
      po.lines[i].received += r.quantity;
      po.lines[i].cost = r.cost;
    }
  });
  po.status = po.lines.every((l) => l.received === l.quantity)
    ? "Selesai"
    : "Diterima sebagian";
  audit(s, `Penerimaan ${id}`);
}
export function stockCount(
  s: BusinessState,
  outlet: StoreId,
  rows: { productId: string; physical: number; version: number }[],
  reason: string,
) {
  requireValue(reason.trim() && rows.length, "Isi alasan penyesuaian.");
  requireValue(
    new Set(rows.map((r) => r.productId)).size === rows.length,
    "Produk opname duplikat.",
  );
  rows.forEach((r) => {
    requireValue(
      s.products.some((p) => p.id === r.productId && !p.archived),
      "Produk opname tidak aktif.",
    );
    requireValue(
      whole(r.physical),
      "Stok fisik harus bilangan bulat positif atau nol.",
    );
    requireValue(
      balance(s, outlet, r.productId).version === r.version,
      "Stok berubah sejak pratinjau. Buat ulang opname.",
    );
  });
  rows.forEach((r) => {
    const b = balance(s, outlet, r.productId),
      cost = b.cost || s.products.find((p) => p.id === r.productId)!.cost;
    if (r.physical > b.stock)
      requireValue(
        cost > 0,
        "Isi biaya awal produk melalui Edit produk sebelum menambah stok tanpa biaya.",
      );
    move(
      s,
      outlet,
      r.productId,
      r.physical - b.stock,
      `Opname: ${reason}`,
      r.physical > b.stock ? cost : undefined,
    );
  });
  audit(s, `Opname disetujui: ${outlet}, ${reason}`);
}
export function saveProduct(s: BusinessState, p: Product) {
  requireValue(
    p.name.trim() && p.sku.trim() && p.variant.trim(),
    "Isi nama, varian, dan SKU.",
  );
  requireValue(
    whole(p.price) && whole(p.cost),
    "Harga harus rupiah bulat positif atau nol.",
  );
  requireValue(
    !s.products.some(
      (x) =>
        x.id !== p.id &&
        (x.sku.toLowerCase() === p.sku.toLowerCase() ||
          (p.barcode && x.barcode === p.barcode)),
    ),
    "SKU atau barcode sudah dipakai.",
  );
  const old = s.products.find((x) => x.id === p.id);
  if (old) Object.assign(old, p);
  else s.products.push(p);
  audit(s, `Produk disimpan: ${p.sku}`);
}
export function liveLowStock(s: BusinessState, outlet: OutletId) {
  return s.balances
    .filter(
      (b) =>
        (outlet === "all" || b.outlet === outlet) &&
        b.stock <= b.minimum &&
        !s.products.find((p) => p.id === b.productId)?.archived,
    )
    .map((b) => {
      const original = inventory.find(
        (i) => i.outlet === b.outlet && i.productId === b.productId,
      );
      const forecast = s.remote?.forecast?.find(
        (f: any) => f.outlet === b.outlet && f.productId === b.productId,
      );
      const incoming = s.purchases
        .filter(
          (p) =>
            p.outlet === b.outlet &&
            ["Disetujui", "Diterima sebagian"].includes(p.status),
        )
        .flatMap((p) => p.lines)
        .filter((l) => l.productId === b.productId)
        .reduce((a, l) => a + l.quantity - l.received, 0);
      const daily = s.remote
          ? Number(forecast?.daily || 0)
          : original?.daily || 1,
        lead = s.remote ? Number(forecast?.lead || 3) : original?.lead || 3,
        safety = s.remote
          ? Number(forecast?.safety || 0)
          : original?.safety || 2;
      return {
        ...b,
        daily,
        lead,
        safety,
        incoming,
        product: s.products.find((p) => p.id === b.productId)!,
        recommended: s.remote
          ? Number(forecast?.recommended || 0)
          : Math.max(
              0,
              Math.ceil(daily * (lead + 7) + safety) - b.stock - incoming,
            ),
        limited: forecast?.limited || false,
      };
    });
}
export function liveSummary(
  s: BusinessState,
  outlet: OutletId,
  period: Period,
) {
  if (s.remote) return liveReport(s, outlet, period);
  const base = getSummary(outlet, period),
    matches = (x: { outlet: StoreId }) =>
      outlet === "all" || x.outlet === outlet;
  const sales = s.sales.filter((x) => !x.seeded && matches(x)),
    refunds = s.refunds.filter(matches);
  const gross = sales.reduce((a, x) => a + x.subtotal - x.discount, 0),
    ref = refunds.reduce((a, x) => a + x.net, 0),
    delta = gross - ref;
  const count = base.count + sales.length;
  const basket = count ? (base.sales + base.refunds + gross) / count : 0;
  const previousBasket =
    base.basketGrowth !== null
      ? base.basket / (1 + base.basketGrowth / 100)
      : 0;
  return {
    ...base,
    sales: base.sales + delta,
    count,
    refunds: base.refunds + ref,
    basket,
    basketGrowth: previousBasket
      ? ((basket - previousBasket) / previousBasket) * 100
      : null,
    salesGrowth: base.previousSales
      ? ((base.sales + delta - base.previousSales) / base.previousSales) * 100
      : null,
    countGrowth: base.previousCount
      ? ((count - base.previousCount) / base.previousCount) * 100
      : null,
    grossProfit:
      base.grossProfit +
      delta -
      sales
        .flatMap((x) => x.lines)
        .reduce((a, l) => a + l.cost * l.quantity, 0) +
      refunds.reduce((a, x) => a + x.cost, 0),
    expenses:
      base.expenses +
      s.expenses.filter(matches).reduce((a, x) => a + x.amount, 0),
    chart: base.chart.map((x, i) =>
      i === base.chart.length - 1
        ? { ...x, sales: x.sales + delta, count: x.count + sales.length }
        : x,
    ),
  };
}
export function liveTopProducts(
  s: BusinessState,
  outlet: OutletId,
  period: Period,
) {
  if (s.remote?.reports?.[outlet + "-" + period])
    return s.remote.reports[outlet + "-" + period].top.map((r: any) => ({
      ...s.products.find((p) => p.id === r.id),
      ...r,
    })) as (Product & { units: number; revenue: number })[];
  const historical = s.remote ? [] : getTopProducts(outlet, period);
  return s.products
    .map((p) => ({
      ...p,
      units: historical.find((h) => h.id === p.id)?.units || 0,
      revenue: historical.find((h) => h.id === p.id)?.revenue || 0,
    }))
    .map((p) => {
      const lines = s.sales
        .filter(
          (x) =>
            !x.seeded &&
            (outlet === "all" || x.outlet === outlet) &&
            (!s.remote ||
              Date.parse(x.date) >=
                Date.parse(s.remote.asOf || new Date().toISOString()) -
                  Number(period) * 86400000),
        )
        .flatMap((x) => x.lines)
        .filter((l) => l.productId === p.id);
      return {
        ...p,
        units: p.units + lines.reduce((a, l) => a + l.quantity - l.refunded, 0),
        revenue:
          p.revenue +
          lines.reduce(
            (a, l) => a + (l.net * (l.quantity - l.refunded)) / l.quantity,
            0,
          ),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
export function parseProductCsv(text: string, s: BusinessState) {
  const records: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) records.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    records.push(row);
  }
  if (quoted) throw new Error("Tanda kutip CSV tidak lengkap.");
  const header = records.shift()?.map((x) =>
    x
      .trim()
      .toLowerCase()
      .replace(/^\uFEFF/, ""),
  );
  if (header?.join(",") !== "name,variant,sku,barcode,category,price,cost")
    throw new Error("Gunakan template CSV dengan urutan kolom yang tersedia.");
  const draft = structuredClone(s);
  return records.map((r, i) => {
    const p: Product = {
      id: `import-${i}`,
      name: r[0]?.trim() || "",
      variant: r[1]?.trim() || "",
      sku: r[2]?.trim() || "",
      barcode: r[3]?.trim() || "",
      category: r[4]?.trim() || "Lainnya",
      price: r[5]?.trim() ? Number(r[5]) : NaN,
      cost: r[6]?.trim() ? Number(r[6]) : NaN,
      color: "blue",
      icon: "bottle",
      share: 0,
      archived: false,
    };
    let error = "";
    try {
      if (r.length !== 7) throw new Error("Jumlah kolom tidak sesuai.");
      saveProduct(draft, p);
    } catch (e) {
      error = (e as Error).message;
    }
    return { row: i + 2, product: p, error };
  });
}

export function allocateMoney(
  total: number,
  rows: { id: string; weight: number }[],
) {
  const weight = rows.reduce((a, r) => a + r.weight, 0);
  if (!weight) return rows.map(() => 0);
  const parts = rows.map((r, i) => {
    const exact = (total * r.weight) / weight;
    return {
      i,
      id: r.id,
      value: Math.floor(exact),
      fraction: exact - Math.floor(exact),
    };
  });
  let left = total - parts.reduce((a, p) => a + p.value, 0);
  [...parts]
    .sort((a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id))
    .forEach((p) => {
      if (left > 0) {
        p.value++;
        left--;
      }
    });
  return parts.map((p) => p.value);
}
export function refundQuote(sale: Sale, quantities: number[]) {
  return sale.lines.reduce(
    (a, l, i) =>
      a +
      Math.round(
        ((l.net + l.tax) * (l.refunded + (quantities[i] || 0))) / l.quantity,
      ) -
      Math.round(((l.net + l.tax) * l.refunded) / l.quantity),
    0,
  );
}
