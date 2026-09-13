// Pure frontend workflow checks: no server, browser, or external services.
const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nusa-demo-"));
for (const name of ["demo-data", "operations", "live-reports"])
  fs.writeFileSync(
    path.join(dir, name + ".js"),
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../lib", name + ".ts"), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
        },
      },
    ).outputText,
  );
const o = require(path.join(dir, "operations.js"));
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  process.stdout.write("✓ " + name + "\n");
}
try {
  test("Checkout requires shift; successful payment records sale, stock, cash, and reporting", () => {
    const s = o.initialBusiness();
    assert.throws(
      () =>
        o.checkout(
          s,
          "dago",
          [{ productId: "milk", quantity: 1 }],
          0,
          0,
          "Tunai",
          20000,
          "",
        ),
      /shift/,
    );
    o.openShift(s, "dago", 200000);
    const before = o.liveSummary(s, "dago", "7");
    const id = o.checkout(
      s,
      "dago",
      [{ productId: "milk", quantity: 2 }],
      1000,
      11,
      "Tunai",
      50000,
      "c1",
    );
    const sale = s.sales.find((x) => x.id === id);
    assert.equal(sale.total, 42180);
    assert.equal(o.balance(s, "dago", "milk").stock, 4);
    assert.equal(o.activeShift(s, "dago").expected, 242180);
    assert.equal(o.liveSummary(s, "dago", "7").sales, before.sales + 38000);
    assert.equal(o.liveSummary(s, "dago", "7").count, before.count + 1);
    assert.throws(
      () =>
        o.checkout(
          s,
          "dago",
          [{ productId: "milk", quantity: 5 }],
          0,
          0,
          "Tunai",
          100000,
          "",
        ),
      /Stok/,
    );
    assert.equal(s.sales.length, 3);
  });
  test("Partial refunds conserve allocated money and restore COGS only for sellable returns", () => {
    const s = o.initialBusiness();
    o.openShift(s, "dago", 300000);
    const id = o.checkout(
      s,
      "dago",
      [
        { productId: "milk", quantity: 3 },
        { productId: "noodle", quantity: 3 },
      ],
      101,
      11,
      "Tunai",
      100000,
      "",
    );
    const sale = s.sales.find((x) => x.id === id);
    const net = sale.subtotal - sale.discount;
    const initialGrossProfit = o.liveSummary(s, "dago", "7").grossProfit;
    assert.equal(
      sale.lines.reduce((a, l) => a + l.net, 0),
      net,
    );
    assert.equal(
      sale.lines.reduce((a, l) => a + l.tax, 0),
      sale.tax,
    );
    const quoted = o.refundQuote(sale, [1, 1]);
    o.refund(s, id, [1, 1], [1, 0], "Satu barang layak jual");
    assert.equal(s.refunds[0].amount, quoted);
    o.refund(s, id, [1, 1], [0, 0], "Rusak");
    o.refund(s, id, [1, 1], [0, 0], "Rusak");
    assert.equal(
      s.refunds.reduce((a, r) => a + r.amount, 0),
      sale.total,
    );
    assert.equal(
      s.refunds.reduce((a, r) => a + r.net, 0),
      net,
    );
    assert.equal(
      s.refunds.reduce((a, r) => a + r.cost, 0),
      15000,
    );
    assert.equal(
      o.liveSummary(s, "dago", "7").grossProfit,
      initialGrossProfit - net + 15000,
    );
    assert.equal(o.balance(s, "dago", "milk").stock, 4);
    assert.equal(o.balance(s, "dago", "noodle").stock, 121);
    assert.throws(
      () => o.refund(s, id, [1, 0], [1, 0], "Terlalu banyak"),
      /Jumlah/,
    );
  });
  test("Largest-remainder discounts and taxes are exact with deterministic tie breaks", () => {
    assert.deepEqual(
      o.allocateMoney(2, [
        { id: "c", weight: 1 },
        { id: "a", weight: 1 },
        { id: "b", weight: 1 },
      ]),
      [0, 1, 1],
    );
    assert.deepEqual(o.allocateMoney(0, [{ id: "a", weight: 0 }]), [0]);
  });
  test("Purchase approval and partial receipts preserve remaining quantities and moving cost", () => {
    const s = o.initialBusiness();
    assert.throws(
      () =>
        o.createPurchase(s, "all", "s1", [
          { productId: "milk", quantity: 1, cost: 18000 },
        ]),
      /outlet tujuan/i,
    );
    const id = o.createPurchase(s, "dago", "s1", [
      { productId: "milk", quantity: 4, cost: 18000 },
    ]);
    assert.throws(
      () => o.receivePurchase(s, id, [{ quantity: 2, cost: 18000 }]),
      /disetujui/,
    );
    s.purchases.find((p) => p.id === id).status = "Disetujui";
    o.receivePurchase(s, id, [{ quantity: 2, cost: 18000 }]);
    assert.equal(o.balance(s, "dago", "milk").stock, 8);
    assert.equal(o.balance(s, "dago", "milk").cost, 15750);
    assert.equal(
      s.purchases.find((p) => p.id === id).status,
      "Diterima sebagian",
    );
    assert.throws(
      () => o.receivePurchase(s, id, [{ quantity: 3, cost: 18000 }]),
      /melebihi/,
    );
    o.receivePurchase(s, id, [{ quantity: 2, cost: 18000 }]);
    assert.equal(s.purchases.find((p) => p.id === id).status, "Selesai");
    assert.equal(o.balance(s, "dago", "milk").cost, 16200);
  });
  test("Stock-count snapshots reject stale revisions and never accept negative balances", () => {
    const s = o.initialBusiness();
    const version = o.balance(s, "dago", "milk").version;
    o.stockCount(
      s,
      "dago",
      [{ productId: "milk", physical: 10, version }],
      "Hitung ulang",
    );
    assert.equal(o.balance(s, "dago", "milk").stock, 10);
    assert.throws(
      () =>
        o.stockCount(
          s,
          "dago",
          [{ productId: "milk", physical: 8, version }],
          "Lama",
        ),
      /berubah/,
    );
    assert.throws(
      () =>
        o.stockCount(
          s,
          "dago",
          [{ productId: "milk", physical: -1, version: 1 }],
          "Salah",
        ),
      /bilangan/,
    );
  });
  test("CSV imports validate quoted fields, duplicate identifiers, and missing prices", () => {
    const s = o.initialBusiness();
    const header = "name,variant,sku,barcode,category,price,cost\n";
    const rows = o.parseProductCsv(
      header +
        '"Teh, Melati",250 ml,TEH-001,123,Minuman,5000,3000\nTeh,500 ml,TEH-001,456,Minuman,7000,4000\nKopi,Default,DRK-001,789,Minuman,5000,3000',
      s,
    );
    assert.equal(rows[0].product.name, "Teh, Melati");
    assert.equal(rows[0].error, "");
    assert.match(rows[1].error, /SKU/);
    assert.match(rows[2].error, /SKU/);
    assert.match(
      o.parseProductCsv(header + "Teh,Default,T-01,321,Minuman,,3000", s)[0]
        .error,
      /Harga/,
    );
    assert.throws(() => o.parseProductCsv(header + '"bad', s), /kutip/);
  });
  test("Shift cash reconciles movements; closing prevents further checkout", () => {
    const s = o.initialBusiness();
    o.openShift(s, "dago", 100000);
    assert.throws(() => o.openShift(s, "dago", 10000), /aktif/);
    o.cashMovement(s, "dago", 20000, "Modal tambahan");
    o.cashMovement(s, "dago", -15000, "Transport");
    assert.equal(o.activeShift(s, "dago").expected, 105000);
    assert.throws(() => o.closeShift(s, "dago", 104000, ""), /Alasan/);
    o.closeShift(s, "dago", 104000, "Selisih hitung");
    assert.equal(o.activeShift(s, "dago"), undefined);
    assert.throws(
      () =>
        o.checkout(
          s,
          "dago",
          [{ productId: "milk", quantity: 1 }],
          0,
          0,
          "Tunai",
          20000,
          "",
        ),
      /shift/,
    );
  });
  test("New outlet can be set up, stocked, and used without changing another outlet", () => {
    const s = o.initialBusiness();
    assert.throws(() => o.openShift(s, "buah-batu", 10000), /register/);
    s.registers.push({
      id: "r3",
      outlet: "buah-batu",
      name: "Kasir 01",
      active: true,
    });
    o.stockCount(
      s,
      "buah-batu",
      [{ productId: "milk", physical: 5, version: 0 }],
      "Saldo awal",
    );
    o.openShift(s, "buah-batu", 100000);
    o.checkout(
      s,
      "buah-batu",
      [{ productId: "milk", quantity: 1 }],
      0,
      0,
      "QRIS",
      19500,
      "",
    );
    assert.equal(o.balance(s, "buah-batu", "milk").stock, 4);
    assert.equal(o.balance(s, "dago", "milk").stock, 6);
    assert.equal(o.liveSummary(s, "buah-batu", "1").sales, 19500);
    assert.equal(o.activeShift(s, "buah-batu").expected, 100000);
  });
  test("Sale COGS remains a snapshot after later purchase costs change", () => {
    const s = o.initialBusiness();
    o.openShift(s, "dago", 100000);
    const id = o.checkout(
      s,
      "dago",
      [{ productId: "milk", quantity: 1 }],
      0,
      0,
      "Tunai",
      20000,
      "",
    );
    const before = o.liveSummary(s, "dago", "7").grossProfit;
    const po = o.createPurchase(s, "dago", "s1", [
      { productId: "milk", quantity: 50, cost: 25000 },
    ]);
    s.purchases.find((x) => x.id === po).status = "Disetujui";
    o.receivePurchase(s, po, [{ quantity: 50, cost: 25000 }]);
    assert.equal(s.sales.find((x) => x.id === id).lines[0].cost, 15000);
    assert.equal(o.liveSummary(s, "dago", "7").grossProfit, before);
  });
  process.stdout.write(`\n${passed} workflow checks passed.\n`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
