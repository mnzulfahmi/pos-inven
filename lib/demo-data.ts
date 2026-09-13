export type OutletId = string;
export type Period = "7" | "30" | "1";
export let outlets: { id: string; name: string; new?: boolean }[] = [
  { id: "all" as const, name: "Semua outlet" },
  { id: "dago" as const, name: "Outlet Dago" },
  { id: "cihampelas" as const, name: "Outlet Cihampelas" },
  { id: "buah-batu" as const, name: "Outlet Buah Batu", new: true },
];
export let asOf = "";
export function setLiveOutlets(
  values: { id: string; name: string }[],
  timestamp: string,
) {
  outlets = [{ id: "all", name: "Semua outlet" }, ...values];
  asOf =
    new Date(timestamp).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) +
    " WIB";
}
export const money = (n: number) =>
  "Rp" + Math.round(n).toLocaleString("id-ID");
export const number = (n: number) => Math.round(n).toLocaleString("id-ID");
export const outletName = (id: OutletId) =>
  outlets.find((o) => o.id === id)?.name ||
  (id === "all" ? "Semua outlet" : "Outlet");
export const periodLabel = (period: Period) =>
  asOf
    ? period === "1"
      ? "Hari ini"
      : period + " hari terakhir"
    : period === "1"
      ? "11 Sep 2026"
      : period === "7"
        ? "5–11 Sep 2026"
        : "13 Agu–11 Sep 2026";
export const previousLabel = (period: Period) =>
  asOf
    ? period === "1"
      ? "Kemarin"
      : period + " hari sebelumnya"
    : period === "1"
      ? "10 Sep 2026"
      : period === "7"
        ? "29 Agu–4 Sep 2026"
        : "14 Jul–12 Agu 2026";

const currentSales = [
  3200000, 4100000, 3680000, 4950000, 3820000, 4320000, 4380000,
];
const currentCounts = [33, 40, 36, 48, 39, 44, 46];
export const dailySales = Array.from({ length: 60 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 6, 14 + index));
  const currentIndex = index - 53;
  const sales =
    currentIndex >= 0
      ? currentSales[currentIndex]
      : Math.round((currentSales[index % 7] / 1.128) * (index < 46 ? 0.91 : 1));
  const count =
    currentIndex >= 0
      ? currentCounts[currentIndex]
      : Math.round(currentCounts[index % 7] / 1.082);
  return {
    date: date.toISOString().slice(0, 10),
    sales,
    count,
    refunds: index % 6 === 0 ? 50000 : 0,
  };
});

export function getSummary(outlet: OutletId, period: Period) {
  const days = Number(period);
  const ratio =
    outlet === "all"
      ? 1
      : outlet === "dago"
        ? 0.58
        : outlet === "cihampelas"
          ? 0.42
          : 0;
  const scope = (row: (typeof dailySales)[number]) => ({
    ...row,
    sales:
      outlet === "cihampelas"
        ? row.sales - Math.round(row.sales * 0.58)
        : Math.round(row.sales * ratio),
    count:
      outlet === "cihampelas"
        ? row.count - Math.round(row.count * 0.58)
        : Math.round(row.count * ratio),
    refunds: Math.round(row.refunds * ratio),
  });
  const current = dailySales.slice(-days).map(scope);
  const previous = dailySales.slice(-days * 2, -days).map(scope);
  const total = (rows: typeof current, field: "sales" | "count" | "refunds") =>
    rows.reduce((sum, row) => sum + row[field], 0);
  const sales = total(current, "sales");
  const count = total(current, "count");
  const refunds = total(current, "refunds");
  const previousSales = total(previous, "sales");
  const previousCount = total(previous, "count");
  const basket = count ? (sales + refunds) / count : 0;
  const previousBasket = previousCount
    ? (previousSales + total(previous, "refunds")) / previousCount
    : 0;
  const growth = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);
  return {
    sales,
    count,
    refunds,
    basket,
    previousSales,
    previousCount,
    salesGrowth: growth(sales, previousSales),
    countGrowth: growth(count, previousCount),
    basketGrowth: growth(basket, previousBasket),
    grossProfit: Math.round(sales * 0.37),
    expenses: Math.round(sales * 0.105),
    chart: current.map((row, i) => ({
      ...row,
      label: new Date(row.date + "T12:00:00Z").toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Jakarta",
      }),
      previous: previous[i]?.sales ?? 0,
      previousCount: previous[i]?.count ?? 0,
    })),
  };
}

export const products = [
  {
    id: "milk",
    name: "Susu UHT Full Cream",
    variant: "Ultra Milk · 1 liter",
    sku: "DRK-001",
    category: "Minuman",
    price: 19500,
    cost: 15000,
    color: "blue",
    icon: "milk",
    share: 0.186,
  },
  {
    id: "rice",
    name: "Beras Pandan Wangi",
    variant: "Cap Bunga · 5 kg",
    sku: "SBN-001",
    category: "Sembako",
    price: 72000,
    cost: 59000,
    color: "amber",
    icon: "wheat",
    share: 0.161,
  },
  {
    id: "oil",
    name: "Minyak Goreng Bimoli",
    variant: "Bimoli · 2 liter",
    sku: "SBN-002",
    category: "Sembako",
    price: 38000,
    cost: 30000,
    color: "yellow",
    icon: "bottle",
    share: 0.124,
  },
  {
    id: "coffee",
    name: "Kopi Susu Gula Aren",
    variant: "Kopi Kenangan · 220 ml",
    sku: "DRK-002",
    category: "Minuman",
    price: 9500,
    cost: 6500,
    color: "brown",
    icon: "coffee",
    share: 0.102,
  },
  {
    id: "noodle",
    name: "Indomie Mi Goreng",
    variant: "Indofood · 85 gram",
    sku: "FD-001",
    category: "Makanan",
    price: 3500,
    cost: 2600,
    color: "green",
    icon: "soup",
    share: 0.084,
  },
];
export const inventory = [
  {
    productId: "milk",
    outlet: "dago" as const,
    stock: 6,
    minimum: 15,
    daily: 4,
    incoming: 0,
    lead: 3,
    safety: 5,
  },
  {
    productId: "rice",
    outlet: "dago" as const,
    stock: 4,
    minimum: 10,
    daily: 2,
    incoming: 8,
    lead: 3,
    safety: 3,
  },
  {
    productId: "oil",
    outlet: "dago" as const,
    stock: 8,
    minimum: 12,
    daily: 3,
    incoming: 0,
    lead: 2,
    safety: 4,
  },
  {
    productId: "coffee",
    outlet: "dago" as const,
    stock: 0,
    minimum: 20,
    daily: 5,
    incoming: 12,
    lead: 2,
    safety: 5,
  },
  {
    productId: "noodle",
    outlet: "dago" as const,
    stock: 124,
    minimum: 30,
    daily: 12,
    incoming: 0,
    lead: 2,
    safety: 10,
  },
  {
    productId: "milk",
    outlet: "cihampelas" as const,
    stock: 9,
    minimum: 15,
    daily: 3,
    incoming: 0,
    lead: 3,
    safety: 5,
  },
  {
    productId: "rice",
    outlet: "cihampelas" as const,
    stock: 5,
    minimum: 10,
    daily: 2,
    incoming: 0,
    lead: 3,
    safety: 3,
  },
  {
    productId: "oil",
    outlet: "cihampelas" as const,
    stock: 7,
    minimum: 12,
    daily: 2,
    incoming: 6,
    lead: 2,
    safety: 4,
  },
  {
    productId: "coffee",
    outlet: "cihampelas" as const,
    stock: 8,
    minimum: 20,
    daily: 4,
    incoming: 0,
    lead: 2,
    safety: 5,
  },
  {
    productId: "noodle",
    outlet: "cihampelas" as const,
    stock: 92,
    minimum: 30,
    daily: 8,
    incoming: 0,
    lead: 2,
    safety: 10,
  },
];
export function getLowStock(outlet: OutletId) {
  return inventory
    .filter(
      (row) =>
        (outlet === "all" || row.outlet === outlet) && row.stock <= row.minimum,
    )
    .map((row) => ({
      ...row,
      product: products.find((p) => p.id === row.productId)!,
      recommended: Math.max(
        0,
        Math.ceil(row.daily * (row.lead + 7) + row.safety) -
          row.stock -
          row.incoming,
      ),
    }));
}
export type LowStockItem = ReturnType<typeof getLowStock>[number];
export function getTopProducts(outlet: OutletId, period: Period) {
  const { sales } = getSummary(outlet, period);
  return products
    .map((product) => {
      const units = Math.floor((sales * product.share) / product.price);
      return { ...product, units, revenue: units * product.price };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
