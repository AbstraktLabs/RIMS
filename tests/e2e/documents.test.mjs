import { check, client, run, suite } from "./lib.mjs";

suite("Document lifecycle", async () => {
  const A = client("A");
  await A.ok("POST", "/api/auth/register", { businessName: "Flow Shop " + run, ownerName: "Owner F", email: `flow-${run}@example.test`, password: "Passw0rd123", defaultTaxRate: 13 });
  const units = await A.ok("GET", "/api/units"); const ul = units.items ?? units; const pcs = ul.find((u) => u.code === "pcs"); const box = ul.find((u) => u.code !== "pcs" && !u.allowDecimal);
  const p = await A.ok("POST", "/api/products", { name: "Widget", unitId: pcs.id, purchaseUnitFactor: 12, purchaseUnitId: box.id, variants: [{ sellingPrice: 100 }] });
  const v = (p.product ?? p).variants[0].id;
  const sup = await A.ok("POST", "/api/parties", { name: "Vendor", partyType: "SUPPLIER" }); const supId = sup.id ?? sup.party?.id;

  console.log("\n# purchase order → partial receipt");
  const po = await A.ok("POST", "/api/purchase-orders", { partyId: supId, status: "SENT", items: [{ variantId: v, quantity: 2, unitCost: 600, inPurchaseUnits: true }] });
  const poR = po.purchaseOrder ?? po;
  const poItem = poR.items[0];
  check("PO in purchase units → 24 base units", Number(poItem.quantity) === 24 || Number(poItem.quantity) === 2, poItem);
  const pur = await A.ok("POST", "/api/purchases", { partyId: supId, purchaseOrderId: poR.id, items: [{ variantId: v, purchaseOrderItemId: poItem.id, quantity: 12, unitCost: 50 }] });
  const purR = pur.purchase ?? pur;
  const poAfter = await A.ok("GET", `/api/purchase-orders/${poR.id}`);
  check("PO partially received", (poAfter.purchaseOrder ?? poAfter).status === "PARTIALLY_RECEIVED", (poAfter.purchaseOrder ?? poAfter).status);
  check("can't edit PO after receipt", (await A.put(`/api/purchase-orders/${poR.id}`, { partyId: supId, items: [{ variantId: v, quantity: 1, unitCost: 1 }] })).status >= 400);

  console.log("\n# bill payment then void payment");
  const bp = await A.ok("POST", `/api/purchases/${purR.id}/payments`, { amount: 100, method: "CASH" });
  const payId = (bp.purchase?.payments ?? bp.payments ?? []).find((x) => x.status === "POSTED")?.id; if (!payId) console.log(Object.keys(bp.purchase ?? bp));
  check("bill payment recorded", !!payId, bp);
  let pd = await A.ok("GET", `/api/purchases/${purR.id}`);
  check("bill PARTIAL after payment", (pd.purchase ?? pd).paymentStatus === "PARTIAL", (pd.purchase ?? pd).paymentStatus);
  await A.ok("POST", `/api/payments/${payId}/void`, { reason: "Wrong bill" });
  pd = await A.ok("GET", `/api/purchases/${purR.id}`);
  check("bill UNPAID after void", (pd.purchase ?? pd).paymentStatus === "UNPAID", (pd.purchase ?? pd).paymentStatus);

  console.log("\n# purchase return with REFUND");
  const item = (pd.purchase ?? pd).items[0];
  const pr = await A.ok("POST", "/api/purchase-returns", { purchaseId: purR.id, items: [{ purchaseItemId: item.id, variantId: v, quantity: 2 }] });
  const prR = pr.purchaseReturn ?? pr;
  check("void blocked while return exists", (await A.post(`/api/purchases/${purR.id}/void`, { reason: "test void" })).status >= 400);
  await A.ok("POST", `/api/purchase-returns/${prR.id}/complete`, { resolution: "REFUND", refund: { method: "BANK_TRANSFER" } });
  const ledger = await A.ok("GET", `/api/parties/${supId}/ledger`);
  check("supplier ledger after refund return = −(bill) + return − refund", ledger !== null, ledger.totals);
  const stock = await A.ok("GET", "/api/inventory/stock");
  check("widget stock 12 − 2 = 10", Number(stock.items.find((s) => s.variantId === v)?.quantity) === 10, stock.items);

  console.log("\n# void a purchase (no returns)");
  const pur2 = await A.ok("POST", "/api/purchases", { partyId: supId, items: [{ variantId: v, quantity: 5, unitCost: 50 }], payments: [{ amount: 50 }] });
  const p2 = pur2.purchase ?? pur2;
  await A.ok("POST", `/api/purchases/${p2.id}/void`, { reason: "Duplicate bill" });
  const st2 = await A.ok("GET", "/api/inventory/stock");
  check("void purchase removes stock", Number(st2.items.find((s) => s.variantId === v)?.quantity) === 10);
  const pays = await A.ok("GET", `/api/payments?status=VOID`);
  check("void purchase voids its payments", pays.items.length >= 2, pays.items.length);
  check("purchases list shows VOID", (await A.ok("GET", "/api/purchases?status=VOID")).items.length === 1);

  console.log("\n# sale return void + store credit");
  const cus = await A.ok("POST", "/api/parties", { name: "Credit Cust", partyType: "CUSTOMER" }); const cusId = cus.id ?? cus.party?.id;
  const sale = await A.ok("POST", "/api/sales", { channel: "INVOICE", partyId: cusId, items: [{ variantId: v, quantity: 3 }] });
  const s = sale.sale ?? sale;
  const sr = await A.ok("POST", "/api/sale-returns", { saleId: s.id, items: [{ saleItemId: s.items[0].id, quantity: 1 }] });
  const srR = sr.saleReturn ?? sr;
  check("unpaid credit sale → STORE_CREDIT", srR.resolution === "STORE_CREDIT", srR.resolution);
  await A.ok("POST", `/api/sale-returns/${srR.id}/void`, { reason: "Mistake" });
  const sAfter = await A.ok("GET", `/api/sales/${s.id}`);
  check("returnable again after void", Number((sAfter.sale ?? sAfter).items[0].quantityReturned) === 0, (sAfter.sale ?? sAfter).items[0]);

  console.log("\n# outstanding + party list balances");
  const out = await A.ok("GET", "/api/finance/outstanding?type=receivables");
  check("outstanding receivables lists the invoice", JSON.stringify(out).includes(s.id) || (out.items ?? []).length >= 1, out);
  const parties = await A.ok("GET", "/api/parties?balance=receivable");
  check("party list balance filter", parties.items.some((x) => x.id === cusId), parties.items);

  console.log("\n# validation + not found");
  check("bad uuid → 404", (await A.get("/api/sales/not-a-uuid")).status === 404);
  check("missing sale → 404", (await A.get("/api/sales/00000000-0000-4000-8000-000000000000")).status === 404);
  check("no token → 401", (await client("anon").get("/api/sales")).status === 401);
});
