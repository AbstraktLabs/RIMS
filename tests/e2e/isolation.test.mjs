import { check, client, newShop, run, suite } from "./lib.mjs";

// Every route that takes a record id, called by the owner of a *different*
// business with a well-formed body. Each must answer 404 and change nothing.

suite("Tenant isolation sweep", async () => {
  const { c: A, reg: regA } = await newShop("IsoA", { defaultTaxRate: 13 });
  const { c: B } = await newShop("IsoB", { defaultTaxRate: 13 });
  const id = (r, ...keys) => {
    for (const k of keys) if (r?.[k]?.id) return r[k].id;
    return r?.id;
  };

  // ── A's records, one of each kind ──
  const pcsA = (await A.ok("GET", "/api/units")).items.find((u) => u.code === "pcs");
  const pcsB = (await B.ok("GET", "/api/units")).items.find((u) => u.code === "pcs");
  const cat = id(await A.ok("POST", "/api/categories", { name: "Cat A" }), "category");
  const brand = id(await A.ok("POST", "/api/brands", { name: "Brand A" }), "brand");
  const unit = id(await A.ok("POST", "/api/units", { name: "Crate", code: `cr${run.slice(-4)}` }), "unit");
  const tax = id(await A.ok("POST", "/api/tax-rates", { name: "Low 5%", rate: 5 }), "taxRate");
  const loc2 = id(await A.ok("POST", "/api/locations", { name: "Back store", type: "WAREHOUSE" }), "location");
  const fcat = id(await A.ok("POST", "/api/finance/categories", { kind: "EXPENSE", name: "Rent A" }), "category");
  const entry = id(await A.ok("POST", "/api/finance/entries", { kind: "EXPENSE", categoryId: fcat, amount: 500, description: "Rent" }), "entry");
  const prodR = await A.ok("POST", "/api/products", { name: "Iso Item", unitId: pcsA.id, variants: [{ sellingPrice: 100 }] });
  const prod = prodR.product ?? prodR;
  const v = prod.variants[0].id;
  const sup = id(await A.ok("POST", "/api/parties", { name: "Sup A", partyType: "SUPPLIER" }), "party");
  const cus = id(await A.ok("POST", "/api/parties", { name: "Cus A", partyType: "CUSTOMER" }), "party");
  const pur = (await A.ok("POST", "/api/purchases", { partyId: sup, items: [{ variantId: v, quantity: 20, unitCost: 50 }] })).purchase;
  const po = (await A.ok("POST", "/api/purchase-orders", { partyId: sup, items: [{ variantId: v, quantity: 5, unitCost: 50 }] })).purchaseOrder;
  const sale = (await A.ok("POST", "/api/sales", { channel: "INVOICE", partyId: cus, items: [{ variantId: v, quantity: 3 }] })).sale;
  const sr = (await A.ok("POST", "/api/sale-returns", { saleId: sale.id, items: [{ saleItemId: sale.items[0].id, quantity: 1 }] })).saleReturn;
  const pr = (await A.ok("POST", "/api/purchase-returns", { purchaseId: pur.id, items: [{ purchaseItemId: pur.items[0].id, variantId: v, quantity: 1 }] })).purchaseReturn;
  const pay = (await A.ok("POST", "/api/payments", { partyId: cus, direction: "RECEIVED_FROM_CUSTOMER", amount: 10 })).payments[0].id;
  const adj = id(await A.ok("POST", "/api/inventory/adjustments", { reason: "DAMAGED", items: [{ variantId: v, quantity: -1 }] }), "adjustment");
  const trf = id(await A.ok("POST", "/api/inventory/transfers", { toLocationId: loc2, items: [{ variantId: v, quantity: 1 }] }), "transfer");
  const roles = (await A.ok("GET", "/api/roles")).items;
  const staff = id(
    await A.ok("POST", "/api/staff", { name: "Staff A", email: `iso-staff-${run}@example.test`, password: "Staff12345", assignments: [{ locationId: regA.activeLocationId, roleId: roles.find((r) => r.name === "Viewer").id }], sendWelcomeEmail: false }),
    "user",
  );

  // B's own records, so request bodies are valid for B
  const vB = (await B.ok("POST", "/api/products", { name: "B item", unitId: pcsB.id, variants: [{ sellingPrice: 1 }] })).product.variants[0].id;
  const supB = id(await B.ok("POST", "/api/parties", { name: "Sup B", partyType: "SUPPLIER" }), "party");

  // snapshot what A can read before the attack
  const reads = [
    `/api/finance/entries/${entry}`, `/api/inventory/adjustments/${adj}`, `/api/inventory/transfers/${trf}`, `/api/parties/${cus}`,
    `/api/parties/${cus}/ledger`, `/api/payments/${pay}`, `/api/products/${prod.id}`, `/api/purchase-orders/${po.id}`,
    `/api/purchase-returns/${pr.id}`, `/api/purchases/${pur.id}`, `/api/sale-returns/${sr.id}`, `/api/sales/${sale.id}`, `/api/staff/${staff}`,
    "/api/categories", "/api/brands", "/api/units", "/api/tax-rates", "/api/locations", "/api/finance/categories",
  ];
  const strip = (j) => JSON.stringify(j, (k, val) => (k === "updatedAt" || k === "lastLoginAt" ? undefined : val));
  const before = new Map();
  for (const r of reads) before.set(r, strip(await A.ok("GET", r)));

  console.log("\n# B attacks A's records");
  const attacks = [
    ["PATCH", `/api/brands/${brand}`, { name: "x" }], ["DELETE", `/api/brands/${brand}`],
    ["PATCH", `/api/categories/${cat}`, { name: "x" }], ["DELETE", `/api/categories/${cat}`],
    ["PATCH", `/api/finance/categories/${fcat}`, { name: "x" }], ["DELETE", `/api/finance/categories/${fcat}`],
    ["GET", `/api/finance/entries/${entry}`], ["PATCH", `/api/finance/entries/${entry}`, { amount: 1 }], ["DELETE", `/api/finance/entries/${entry}`],
    ["GET", `/api/inventory/adjustments/${adj}`],
    ["GET", `/api/inventory/transfers/${trf}`], ["POST", `/api/inventory/transfers/${trf}/dispatch`, {}],
    ["POST", `/api/inventory/transfers/${trf}/receive`, {}], ["POST", `/api/inventory/transfers/${trf}/cancel`, { reason: "attack" }],
    ["PATCH", `/api/locations/${loc2}`, { name: "x" }], ["DELETE", `/api/locations/${loc2}`],
    ["GET", `/api/parties/${cus}`], ["GET", `/api/parties/${cus}/ledger`], ["PATCH", `/api/parties/${cus}`, { name: "x" }], ["DELETE", `/api/parties/${cus}`],
    ["GET", `/api/payments/${pay}`], ["POST", `/api/payments/${pay}/void`, { reason: "attack attack" }],
    ["DELETE", `/api/products/${prod.id}/image`],
    ["GET", `/api/products/${prod.id}`], ["PUT", `/api/products/${prod.id}`, { name: "x", unitId: pcsB.id, variants: [{ sellingPrice: 1 }] }], ["DELETE", `/api/products/${prod.id}`],
    ["GET", `/api/purchase-orders/${po.id}`], ["PUT", `/api/purchase-orders/${po.id}`, { partyId: supB, items: [{ variantId: vB, quantity: 1, unitCost: 1 }] }],
    ["DELETE", `/api/purchase-orders/${po.id}`], ["POST", `/api/purchase-orders/${po.id}/status`, { status: "CANCELLED" }],
    ["GET", `/api/purchase-returns/${pr.id}`], ["POST", `/api/purchase-returns/${pr.id}/complete`, { resolution: "CREDIT_NOTE" }], ["POST", `/api/purchase-returns/${pr.id}/void`, { reason: "attack attack" }],
    ["GET", `/api/purchases/${pur.id}`], ["POST", `/api/purchases/${pur.id}/payments`, { amount: 1, method: "CASH" }], ["POST", `/api/purchases/${pur.id}/void`, { reason: "attack attack" }],
    ["GET", `/api/sale-returns/${sr.id}`], ["POST", `/api/sale-returns/${sr.id}/void`, { reason: "attack attack" }],
    ["GET", `/api/sales/${sale.id}`], ["POST", `/api/sales/${sale.id}/payments`, { amount: 1, method: "CASH" }], ["POST", `/api/sales/${sale.id}/void`, { reason: "attack attack" }],
    ["GET", `/api/staff/${staff}`], ["PATCH", `/api/staff/${staff}`, { isActive: false }], ["DELETE", `/api/staff/${staff}`],
    ["POST", `/api/staff/${staff}/reset-password`, { password: "Attack1234" }],
    ["PATCH", `/api/tax-rates/${tax}`, { name: "x" }], ["DELETE", `/api/tax-rates/${tax}`],
    ["PATCH", `/api/units/${unit}`, { name: "x" }], ["DELETE", `/api/units/${unit}`],
    ["GET", `/api/variants/${v}/lots`], ["GET", `/api/variants/${v}/serials`],
    // ids smuggled inside bodies
    ["POST", "/api/sales", { channel: "INVOICE", partyId: cus, items: [{ variantId: vB, quantity: 1 }] }],
    ["POST", "/api/purchases", { partyId: sup, items: [{ variantId: vB, quantity: 1, unitCost: 1 }] }],
    ["POST", "/api/sale-returns", { saleId: sale.id, items: [{ saleItemId: sale.items[0].id, quantity: 1 }] }],
    ["POST", "/api/purchase-returns", { purchaseId: pur.id, items: [{ purchaseItemId: pur.items[0].id, variantId: v, quantity: 1 }] }],
    ["POST", "/api/inventory/adjustments", { reason: "FOUND", items: [{ variantId: v, quantity: 5, unitCost: 1 }] }],
    ["POST", "/api/products", { name: "Smuggle", unitId: pcsA.id, categoryId: cat, brandId: brand, taxRateId: tax, variants: [{ sellingPrice: 1 }] }],
    ["POST", "/api/finance/entries", { kind: "EXPENSE", categoryId: fcat, amount: 1, description: "x" }],
    ["POST", "/api/inventory/transfers", { toLocationId: loc2, items: [{ variantId: vB, quantity: 1 }] }],
    ["GET", `/api/inventory/stock?locationId=${regA.activeLocationId}`],
    ["GET", `/api/reports/sales?locationId=${regA.activeLocationId}`],
  ];
  const leaks = [];
  for (const [method, path, body] of attacks) {
    const r = await B.call(method, path, body);
    if (r.status !== 404) leaks.push(`${method} ${path.replace(/[0-9a-f-]{36}/g, ":id")} → ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  }
  check(`all ${attacks.length} cross-business requests answer 404`, leaks.length === 0, leaks);
  if (leaks.length) console.log(leaks.map((l) => "      " + l).join("\n"));

  console.log("\n# A's data is untouched");
  const changed = [];
  for (const r of reads) if (strip(await A.ok("GET", r)) !== before.get(r)) changed.push(r);
  check("every record A can read is byte-for-byte the same", changed.length === 0, changed);
  check("A's staff member can still sign in with their own password", (await client("st").post("/api/auth/login", { email: `iso-staff-${run}@example.test`, password: "Staff12345" })).status === 200);
});
