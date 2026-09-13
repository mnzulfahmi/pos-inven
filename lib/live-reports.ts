import type { BusinessState } from "./operations";
import type { Period } from "./demo-data";
const dayKey = (d: string) =>
  new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
export function liveReport(s: BusinessState, outlet: string, period: Period) {
  if (s.remote?.reports?.[outlet + "-" + period])
    return s.remote.reports[outlet + "-" + period].summary as {
      sales: number;
      count: number;
      refunds: number;
      basket: number;
      grossProfit: number;
      expenses: number;
      previousSales: number;
      previousCount: number;
      salesGrowth: number | null;
      countGrowth: number | null;
      basketGrowth: number | null;
      chart: {
        date: string;
        label: string;
        sales: number;
        count: number;
        refunds: number;
        previous: number;
        previousCount: number;
      }[];
    };
  const days = Number(period),
    now = new Date(s.remote?.asOf || Date.now()),
    today = dayKey(now.toISOString());
  const end = Date.parse(today + "T00:00:00+07:00") + 86400000,
    start = end - days * 86400000,
    previous = start - days * 86400000;
  const scoped = (a: { outlet: string }) =>
    outlet === "all" || a.outlet === outlet;
  const sales = s.sales.filter(scoped),
    refunds = (s.remote?.refunds || []).filter(
      (a: any) =>
        a.status === "posted" && (outlet === "all" || a.outlet_id === outlet),
    );
  const summarize = (from: number, to: number) => {
    const ss = sales.filter(
        (a) => Date.parse(a.date) >= from && Date.parse(a.date) < to,
      ),
      rr = refunds.filter(
        (a: any) =>
          Date.parse(a.posted_at) >= from && Date.parse(a.posted_at) < to,
      );
    const gross = ss.reduce((n, a) => n + a.subtotal - a.discount, 0),
      refund = rr.reduce((n: number, a: any) => n + Number(a.net), 0);
    return {
      sales: gross - refund,
      count: ss.length,
      refunds: refund,
      basket: ss.length ? gross / ss.length : 0,
      grossProfit:
        gross -
        refund -
        ss
          .flatMap((a) => a.lines)
          .reduce((n, l) => n + l.quantity * l.cost, 0) +
        rr.reduce((n: number, a: any) => n + Number(a.cost || 0), 0),
    };
  };
  const current = summarize(start, end),
    prev = summarize(previous, start),
    growth = (v: number, b: number) => (b ? ((v - b) / b) * 100 : null);
  return {
    ...current,
    previousSales: prev.sales,
    previousCount: prev.count,
    salesGrowth: growth(current.sales, prev.sales),
    countGrowth: growth(current.count, prev.count),
    basketGrowth: growth(current.basket, prev.basket),
    expenses: (s.remote?.expenses || [])
      .filter(
        (a: any) =>
          (outlet === "all" || a.outlet_id === outlet) &&
          Date.parse(a.occurred_at) >= start &&
          Date.parse(a.occurred_at) < end,
      )
      .reduce((n: number, a: any) => n + Number(a.amount), 0),
    chart: Array.from({ length: days }, (_, i) => {
      const d = start + i * 86400000,
        a = summarize(d, d + 86400000),
        b = summarize(d - days * 86400000, d - (days - 1) * 86400000);
      return {
        date: dayKey(new Date(d).toISOString()),
        label: new Date(d).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          timeZone: "Asia/Jakarta",
        }),
        sales: a.sales,
        count: a.count,
        refunds: a.refunds,
        previous: b.sales,
        previousCount: b.count,
      };
    }),
  };
}
