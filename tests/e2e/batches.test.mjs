import { check, near, newShop, suite } from "./lib.mjs";

// The pharmacy-style Batches screen: expiry status, return a batch to its
// supplier (refund or replacement), write a batch off (counted as a loss in
// Analytics), and the one-step stock transfer between locations.

suite("Batches, returns, write-offs and transfers", async () => {
  const { c: A } = await newShop("Batches");
  const pcs = (await A.ok("GET", "/api/units")).items.find((u) => u.code === "pcs");
  const juice = (await A.ok("POST", "/api/products", { name: "Juice", unitId: pcs.id, trackExpiry: true, variants: [{ sellingPrice: 0 }] })).product;
  const v = juice.variants[0].id;
  const sup = (await A.ok("POST", "/api/parties", { name: "Juice Supplier", partyType: "SUPPLIER" })).party.id;
  const today = new Date().toISOString().slice(0, 10);
  const days = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const lot = (batchNumber, quantity, expiryDate) => ({ productId: v, purchaseRate: 50, batch: { batchNumber, quantity, expiryDate, salePrice: 80 } });
  await A.ok("POST", "/api/purchase-vouchers", {
    partyId: sup,
    purcType: "VAT_EXEMPT",
    paymentType: "CREDIT",
    items: [lot("OLD", 10, days(-3)), lot("SOON", 10, days(5)), lot("FRESH", 20, days(200))],
  });

  console.log("\n# batches");
  const list = await A.ok("GET", "/api/batches?status=all&limit=50");
  const by = (n) => list.batches.find((b) => b.batchNumber === n);
  check("expired, near-expiry and active batches", by("OLD").status === "EXPIRED" && by("SOON").status === "NEAR_EXPIRY" && by("FRESH").status === "ACTIVE", list.batches.map((b) => [b.batchNumber, b.status]));
  check("summary counts value at risk", list.summary.expired.count === 1 && near(list.summary.expired.value, 500), list.summary);
  const nearOnly = await A.ok("GET", "/api/batches?status=near");
  check("near-expiry filter", nearOnly.batches.length === 1 && nearOnly.batches[0].batchNumber === "SOON");

  console.log("\n# supplier return");
  const ret = await A.post("/api/batches/returns", { batchId: by("SOON").batchId, quantity: 4, reason: "Damaged cartons" });
  check("return a batch to the supplier", ret.status < 300, ret.json);
  const owed = async () => (await A.ok("GET", `/api/parties/${sup}`)).party.balance;
  const returns = (await A.ok("GET", "/api/batches/returns")).items;
  const r1 = returns[0];
  check("return is listed, waiting to be settled", returns.length === 1 && r1.quantity === 4 && r1.resolutionType === null, returns);
  await A.ok("PATCH", `/api/batches/returns/${r1.id}`, { resolutionType: "MONEY", settleAs: "CREDIT_NOTE" });
  check("credit note lowers what we owe the supplier", near(await owed(), -(2000 - 200)), await owed());
  const after = (await A.ok("GET", "/api/batches?status=near")).batches[0];
  check("returned quantity leaves the batch", near(after.quantityAvailable, 6));

  console.log("\n# write-off");
  const wo = await A.post("/api/batches/writeoff", { batchId: by("OLD").batchId, reason: "Expired on shelf" });
  check("write off an expired batch", wo.status < 300, wo.json);
  const offs = (await A.ok("GET", "/api/batches/writeoff")).writeOffs;
  check("write-off listed with its loss", offs.length === 1 && offs[0].quantity === 10 && near(offs[0].totalLoss, 500), offs);
  const again = await A.post("/api/batches/writeoff", { batchId: by("OLD").batchId });
  check("an empty batch can't be written off again", again.status === 400, again.json);
  const ym = today.slice(0, 7);
  const split = await A.ok("GET", `/api/analytics/expense-split?mode=monthly&startMonth=${ym}&endMonth=${ym}`);
  check("analytics counts the write-off as an expense", split.categories.some((c) => c.category === "Inventory Write-off" && near(c.amount, 500)), split);
  const stats = await A.ok("GET", `/api/analytics/stats?mode=monthly&startMonth=${ym}&endMonth=${ym}`);
  check("and it lowers net profit", near(stats.totalExpense, 500) && near(stats.netProfit, -500), stats);

  console.log("\n# transfer between locations");
  const shop2 = (await A.ok("POST", "/api/locations", { name: "Branch 2" })).location;
  const t = await A.post("/api/inventory/transfers", { toLocationId: shop2.id, receive: true, items: [{ variantId: v, quantity: 5 }] });
  check("one-step transfer", t.status < 300, t.json);
  const here = (await A.ok("GET", "/api/inventory/variants")).products.find((p) => p.id === v);
  check("stock leaves this location", near(here.stockQuantity, 21), here.stockQuantity);
  const there = await A.ok("GET", `/api/inventory/stock?locationId=${shop2.id}&search=Juice`);
  check("and arrives at the other one", there.items.some((i) => near(i.quantity, 5)), there.items);
});
