import { check, client, run, suite } from "./lib.mjs";

suite("Module integration", async () => {
  const A = client("A");
  await A.ok("POST", "/api/auth/register", { businessName: "Link Shop " + run, ownerName: "Owner L", email: `link-${run}@example.test`, password: "Passw0rd123", defaultTaxRate: 13 });
  const ul = (await A.ok("GET", "/api/units")).items; const pcs = ul.find((u) => u.code === "pcs");
  const box = ul.find((u) => u.code !== "pcs" && !u.allowDecimal);
  const tax = (await A.ok("GET", "/api/tax-rates")).items.find((t) => t.isDefault);
  const mk = async (name, threshold, extra = {}) => {
    const r = await A.ok("POST", "/api/products", { name, unitId: pcs.id, taxRateId: tax.id, ...extra, variants: [{ sellingPrice: 100, costPrice: 40, ...(threshold != null && { lowStockThreshold: threshold }) }] });
    const p = r.product ?? r; return { id: p.id, v: p.variants[0].id };
  };
  const soap = await mk("Soap", 10);
  const cable = await mk("Cable", 5);
  const mug = await mk("Mug", 4);
  await mk("Never stocked", 3); // never purchased: must not count as out of stock
  const juice = await mk("Juice", 12, { purchaseUnitId: box.id, purchaseUnitFactor: 6 });
  const sup = await A.ok("POST", "/api/parties", { name: "Wholesaler", partyType: "SUPPLIER" }); const supId = sup.id ?? sup.party?.id;
  const cus = await A.ok("POST", "/api/parties", { name: "Regular", partyType: "CUSTOMER" }); const cusId = cus.id ?? cus.party?.id;

  const pur = (await A.ok("POST", "/api/purchases", { partyId: supId, items: [
    { variantId: soap.v, quantity: 6, unitCost: 40 },
    { variantId: cable.v, quantity: 2, unitCost: 40 },
    { variantId: mug.v, quantity: 20, unitCost: 40 },
    { variantId: juice.v, quantity: 1, unitCost: 40 },
  ] })).purchase;
  const sale = (await A.ok("POST", "/api/sales", { channel: "INVOICE", partyId: cusId, items: [{ variantId: cable.v, quantity: 2 }] })).sale;

  console.log("\n# dashboard counts = stock-page filters");
  const dash = await A.ok("GET", "/api/dashboard");
  const low = await A.ok("GET", "/api/inventory/stock?status=low");
  const out = await A.ok("GET", "/api/inventory/stock?status=out");
  check("low stock: soap + juice", low.total === 2 && low.items.every((r) => [soap.v, juice.v].includes(r.variantId)), low.items.map((r) => r.displayName));
  check("out of stock: cable only (never-stocked item not counted)", out.total === 1 && out.items[0].variantId === cable.v, out.items.map((r) => r.displayName));
  check("dashboard low = stock page low", dash.kpis.lowStock === low.total, [dash.kpis.lowStock, low.total]);
  check("dashboard out = stock page out", dash.kpis.outOfStock === out.total, [dash.kpis.outOfStock, out.total]);

  console.log("\n# reorder suggestions");
  let re = await A.ok("GET", "/api/products/reorder");
  const by = (rows, v) => rows.items.find((i) => i.variantId === v);
  check("suggests soap, cable, juice only", re.items.length === 3 && [soap.v, cable.v, juice.v].every((v) => by(re, v)), re.items.map((i) => i.displayName));
  check("soap: 2×10 − 6 = 14", by(re, soap.v)?.suggestedQuantity === 14, by(re, soap.v));
  check("cable: 2×5 − 0 = 10", by(re, cable.v)?.suggestedQuantity === 10, by(re, cable.v));
  check("juice: 2×12 − 1 = 23 base units, with pack info", by(re, juice.v)?.suggestedQuantity === 23 && by(re, juice.v)?.purchaseUnitFactor === 6, by(re, juice.v));
  check("carries picker fields (tax rate, cost)", by(re, soap.v)?.taxRate === 13 && by(re, soap.v)?.costPrice > 0, { taxRate: by(re, soap.v)?.taxRate, taxRateId: by(re, soap.v)?.taxRateId, tax, cost: by(re, soap.v)?.costPrice });
  const po = (await A.ok("POST", "/api/purchase-orders", { partyId: supId, status: "SENT", items: [{ variantId: soap.v, quantity: 4, unitCost: 40 }] })).purchaseOrder;
  await A.ok("POST", "/api/purchase-orders", { partyId: supId, status: "DRAFT", items: [{ variantId: cable.v, quantity: 10, unitCost: 40 }] });
  re = await A.ok("GET", "/api/products/reorder");
  check("sent PO counts as on order: soap 14 − 4 = 10", by(re, soap.v)?.suggestedQuantity === 10 && by(re, soap.v)?.onOrder === 4, by(re, soap.v));
  check("draft PO does not count: cable still 10", by(re, cable.v)?.suggestedQuantity === 10, by(re, cable.v));
  check("bad location → 404", (await A.get("/api/products/reorder?locationId=00000000-0000-4000-8000-000000000000")).status === 404);
  check("no token → 401", (await client("anon").get("/api/products/reorder")).status === 401);

  console.log("\n# document lines link to products");
  const sd = (await A.ok("GET", `/api/sales/${sale.id}`)).sale;
  check("sale line has productId", sd.items[0].productId === cable.id, sd.items[0]);
  const pd = (await A.ok("GET", `/api/purchases/${pur.id}`)).purchase;
  check("purchase lines have productId", pd.items.every((i) => [soap.id, cable.id, mug.id, juice.id].includes(i.productId)), pd.items.map((i) => i.productId));
  const pod = (await A.ok("GET", `/api/purchase-orders/${po.id}`)).purchaseOrder;
  check("PO line has productId", pod.items[0].productId === soap.id, pod.items[0]);
  const sr = (await A.ok("POST", "/api/sale-returns", { saleId: sale.id, items: [{ saleItemId: sd.items[0].id, quantity: 1 }] })).saleReturn;
  const srd = (await A.ok("GET", `/api/sale-returns/${sr.id}`)).saleReturn;
  check("sale return line has productId and partyId", srd.items[0].productId === cable.id && srd.partyId === cusId, { p: srd.items[0].productId, party: srd.partyId });
  const prr = (await A.ok("POST", "/api/purchase-returns", { purchaseId: pur.id, items: [{ purchaseItemId: pd.items.find((i) => i.variantId === mug.v).id, variantId: mug.v, quantity: 1 }] })).purchaseReturn;
  const prd = (await A.ok("GET", `/api/purchase-returns/${prr.id}`)).purchaseReturn;
  check("purchase return line has productId", prd.items[0].productId === mug.id, prd.items[0]);
  const adj = await A.ok("POST", "/api/inventory/adjustments", { reason: "DAMAGED", items: [{ variantId: mug.v, quantity: -1 }] });
  const adjId = (adj.adjustment ?? adj).id;
  const ad = await A.ok("GET", `/api/inventory/adjustments/${adjId}`);
  check("adjustment line has productId", (ad.adjustment ?? ad).items[0].productId === mug.id, (ad.adjustment ?? ad).items[0]);
  const lots = await A.ok("GET", "/api/inventory/lots");
  check("lots rows carry productId when present", lots.items.every((l) => typeof l.productId === "string"), lots.items.slice(0, 1));
  const serials = await A.ok("GET", "/api/inventory/serials");
  check("serials endpoint still OK", Array.isArray(serials.items));
});
