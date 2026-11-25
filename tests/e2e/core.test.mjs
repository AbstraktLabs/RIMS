import { check, client, near, run, suite } from "./lib.mjs";

suite("Core flows", async () => {
  const A = client("A");
  console.log("\n# auth");
  const email = `owner-${run}@example.test`;
  const reg = await A.ok("POST", "/api/auth/register", {
    businessName: "Test Mart", businessType: "GROCERY", ownerName: "Owner One", email, password: "Passw0rd123",
    currencyCode: "NPR", currencySymbol: "Rs.", timezone: "Asia/Kathmandu", taxLabel: "VAT", defaultTaxRate: 13,
  });
  check("register returns token + org", reg.accessToken && reg.organization?.slug, reg);
  const loc1 = reg.activeLocationId;
  check("weak password rejected", (await A.post("/api/auth/register", { businessName: "X", ownerName: "Xx", email: `x-${run}@example.test`, password: "short" })).status === 400);
  check("duplicate email rejected", (await A.post("/api/auth/register", { businessName: "Dup", ownerName: "Dup", email, password: "Passw0rd123" })).status === 409);
  const bad = client("bad");
  check("wrong password → 401", (await bad.post("/api/auth/login", { email, password: "Wrong1234" })).status === 401);
  const login = await client("A2").ok("POST", "/api/auth/login", { email, password: "Passw0rd123" });
  check("login ok", !!login.accessToken);
  const refreshed = await A.ok("POST", "/api/auth/refresh");
  check("refresh rotates via cookie", !!refreshed.accessToken);
  const me = await A.ok("GET", "/api/auth/me");
  check("me shows owner", me.user?.isOwner === true, me);

  console.log("\n# settings");
  await A.ok("PATCH", "/api/settings", { settings: { taxRegistered: true, enableSerialTracking: true, enableVariants: true, expiryAlertDays: 30 } });
  const settings = await A.ok("GET", "/api/settings");
  check("settings updated", settings.settings?.taxRegistered === true && settings.settings?.enableSerialTracking === true, settings.settings);
  const units = (await A.ok("GET", "/api/units")).items ?? (await A.ok("GET", "/api/units"));
  const unitList = Array.isArray(units) ? units : units.items;
  const kg = unitList.find((u) => u.code === "kg"); const pcs = unitList.find((u) => u.code === "pcs");
  check("default units present", kg && pcs, unitList.map((u) => u.code));
  const taxRatesRes = await A.ok("GET", "/api/tax-rates");
  const taxRates = Array.isArray(taxRatesRes) ? taxRatesRes : taxRatesRes.items;
  const vat = taxRates.find((t) => Number(t.rate) === 13);
  check("13% tax rate created at sign-up", !!vat, taxRates);
  const loc2 = await A.ok("POST", "/api/locations", { name: "Warehouse", type: "WAREHOUSE" });
  const loc2Id = loc2.id ?? loc2.location?.id;
  check("second location", !!loc2Id, loc2);

  console.log("\n# catalog");
  const cat = await A.ok("POST", "/api/categories", { name: "Groceries" });
  const catId = cat.id ?? cat.category?.id;
  const brand = await A.ok("POST", "/api/brands", { name: "Acme" });
  const brandId = brand.id ?? brand.brand?.id;
  const rice = await A.ok("POST", "/api/products", {
    name: "Basmati Rice", categoryId: catId, brandId, unitId: kg.id, taxRateId: vat.id, trackBatches: true, trackExpiry: true,
    lowStockThreshold: 10, variants: [{ sellingPrice: 180, costPrice: 150, barcode: `890${run}` }],
  });
  const riceP = rice.product ?? rice;
  const riceV = riceP.variants[0].id;
  check("rice product with default variant", !!riceV, rice);
  const tee = await A.ok("POST", "/api/products", {
    name: "T-Shirt", unitId: pcs.id, taxRateId: vat.id, variantOptions: [{ name: "Size", values: ["S", "M"] }],
    attributes: { Material: "Cotton" },
    variants: [{ optionValues: { Size: "S" }, sellingPrice: 500 }, { optionValues: { Size: "M" }, sellingPrice: 550 }],
  });
  const teeP = tee.product ?? tee;
  const [teeS, teeM] = teeP.variants.map((v) => v.id);
  check("variant product with 2 variants + generated SKUs", teeP.variants.length === 2 && teeP.variants.every((v) => v.sku), teeP.variants);
  const phone = await A.ok("POST", "/api/products", { name: "Phone X", unitId: pcs.id, taxRateId: vat.id, trackSerials: true, variants: [{ sellingPrice: 30000 }] });
  const phoneV = (phone.product ?? phone).variants[0].id;
  check("serial product", !!phoneV);
  check("serials need whole-number unit", (await A.post("/api/products", { name: "Bad", unitId: kg.id, trackSerials: true, variants: [{ sellingPrice: 1 }] })).status === 400);
  check("duplicate SKU rejected", (await A.post("/api/products", { name: "Dup", unitId: pcs.id, variants: [{ sku: teeP.variants[0].sku, sellingPrice: 1 }] })).status >= 400);

  console.log("\n# parties");
  const sup = await A.ok("POST", "/api/parties", { name: "Supplier Co", partyType: "SUPPLIER" });
  const supId = sup.id ?? sup.party?.id;
  const cus = await A.ok("POST", "/api/parties", { name: "Ram Customer", partyType: "CUSTOMER", creditLimit: 3000 });
  const cusId = cus.id ?? cus.party?.id;
  check("parties created", supId && cusId);

  console.log("\n# purchase");
  const pur = await A.ok("POST", "/api/purchases", {
    partyId: supId, supplierInvoiceNumber: "INV-77", taxMode: "EXCLUSIVE",
    items: [
      { variantId: riceV, quantity: 50, unitCost: 150, lotNumber: "L-LATE", expiryDate: "2027-06-30" },
      { variantId: riceV, quantity: 20, unitCost: 140, lotNumber: "L-SOON", expiryDate: "2026-12-10" },
      { variantId: teeS, quantity: 10, unitCost: 300 },
      { variantId: teeM, quantity: 10, unitCost: 300 },
      { variantId: phoneV, quantity: 3, unitCost: 20000, serials: [`SN-${run}-1`, `SN-${run}-2`, `SN-${run}-3`] },
    ],
    payments: [{ amount: 50000, method: "BANK_TRANSFER" }],
  });
  const purchase = pur.purchase ?? pur;
  // 50*150 + 20*140 + 20*300 + 3*20000 = 7500+2800+6000+60000 = 76300; +13% = 86219
  check("purchase grand total incl. 13% VAT", near(purchase.grandTotal, 86219), { grandTotal: purchase.grandTotal, tax: purchase.taxAmount });
  check("purchase partially paid", purchase.paymentStatus === "PARTIAL", purchase.paymentStatus);
  check("phone serial count mismatch rejected", (await A.post("/api/purchases", { partyId: supId, items: [{ variantId: phoneV, quantity: 2, unitCost: 1, serials: ["ONLY-ONE"] }] })).status === 400);

  const stock = await A.ok("GET", `/api/inventory/stock?search=Rice`);
  const riceStock = stock.items.find((s) => s.variantId === riceV);
  check("rice stock = 70", riceStock && near(riceStock.quantity, 70), stock.items);
  const look = await A.ok("GET", `/api/products/lookup?code=SN-${run}-2`);
  check("lookup by serial", JSON.stringify(look).includes(phoneV), look);

  console.log("\n# POS sale (walk-in, decimal qty, serial, split payment, change)");
  // rice 2.5 × 180 = 450; tee S 2 × 500 = 1000; phone 30000 → 31450 + 13% = 35538.50
  const sale1 = await A.ok("POST", "/api/sales", {
    channel: "POS",
    items: [
      { variantId: riceV, quantity: 2.5 },
      { variantId: teeS, quantity: 2 },
      { variantId: phoneV, quantity: 1, serials: [`SN-${run}-1`] },
    ],
    payments: [{ amount: 30000, method: "CARD" }, { amount: 6000, method: "CASH" }],
  });
  const s1 = sale1.sale ?? sale1;
  check("POS total with VAT", near(s1.grandTotal, 35538.5), { grandTotal: s1.grandTotal, tax: s1.taxAmount });
  check("change given from cash", near(s1.changeGiven, 461.5), s1.changeGiven);
  check("POS sale paid", s1.paymentStatus === "PAID", s1.paymentStatus);
  const s1d = await A.ok("GET", `/api/sales/${s1.id}`);
  const sd = s1d.sale ?? s1d;
  const riceLines = sd.items.filter((i) => i.variantId === riceV);
  check("FEFO: rice drawn from L-SOON lot", riceLines.length === 1 && (riceLines[0].lotNumber === "L-SOON" || JSON.stringify(riceLines[0]).includes("L-SOON")), riceLines);
  check("COGS visible to owner", sd.totalCost !== undefined && near(sd.totalCost, 2.5 * 140 + 2 * 300 + 20000), sd.totalCost);
  check("sold serial can't be sold again", (await A.post("/api/sales", { items: [{ variantId: phoneV, quantity: 1, serials: [`SN-${run}-1`] }], payments: [{ amount: 40000 }] })).status === 400);
  { const os = await A.post("/api/sales", { items: [{ variantId: teeS, quantity: 999 }], payments: [{ amount: 999999 }] }); check("over-selling rejected (422)", os.status === 422, os); }
  check("credit sale to walk-in rejected", (await A.post("/api/sales", { items: [{ variantId: teeS, quantity: 1 }] })).status === 400);

  console.log("\n# credit sale + credit limit");
  const sale2 = await A.ok("POST", "/api/sales", { channel: "INVOICE", partyId: cusId, items: [{ variantId: teeM, quantity: 4 }] }); // 2200 + 286 = 2486
  const s2 = sale2.sale ?? sale2;
  check("credit sale unpaid", s2.paymentStatus === "UNPAID" && near(s2.grandTotal, 2486), s2);
  check("credit limit enforced", (await A.post("/api/sales", { channel: "INVOICE", partyId: cusId, items: [{ variantId: teeM, quantity: 2 }] })).status === 400);

  console.log("\n# void sale restores stock");
  const sale3 = await A.ok("POST", "/api/sales", { items: [{ variantId: teeM, quantity: 1 }], payments: [{ amount: 621.5 }] });
  const s3 = sale3.sale ?? sale3;
  await A.ok("POST", `/api/sales/${s3.id}/void`, { reason: "Entered twice" });
  const teeStock = (await A.ok("GET", `/api/inventory/stock?search=T-Shirt`)).items.find((s) => s.variantId === teeM);
  check("tee M stock = 10 − 4 (void restored)", near(teeStock?.quantity, 6), teeStock);

  console.log("\n# sale return (resellable + damaged serial) → refund");
  const s1Tee = sd.items.find((i) => i.variantId === teeS);
  const s1Phone = sd.items.find((i) => i.variantId === phoneV);
  const ret = await A.ok("POST", "/api/sale-returns", {
    saleId: s1.id, reason: "Customer changed mind",
    items: [
      { saleItemId: s1Tee.id, quantity: 1, condition: "RESELLABLE" },
      { saleItemId: s1Phone.id, quantity: 1, condition: "DAMAGED", serials: [`SN-${run}-1`] },
    ],
  });
  const r1 = ret.saleReturn ?? ret.return ?? ret;
  check("return refund = 500×1.13 + 30000×1.13", near(r1.grandTotal, 565 + 33900), r1);
  check("return resolution REFUND", r1.resolution === "REFUND", r1.resolution);
  check("can't return more than sold", (await A.post("/api/sale-returns", { saleId: s1.id, items: [{ saleItemId: s1Tee.id, quantity: 5 }] })).status === 400);
  const serials = await A.ok("GET", `/api/inventory/serials?search=SN-${run}-1`);
  check("damaged serial marked DAMAGED", JSON.stringify(serials).includes("DAMAGED"), serials);

  console.log("\n# party payment + ledger");
  const pay = await A.ok("POST", "/api/payments", { partyId: cusId, direction: "RECEIVED_FROM_CUSTOMER", amount: 1000, method: "MOBILE_WALLET" });
  check("payment recorded", pay.payments?.length === 1 && pay.onAccount === 0, pay);
  const s2After = await A.ok("GET", `/api/sales/${s2.id}`);
  check("payment allocated to oldest invoice", (s2After.sale ?? s2After).paymentStatus === "PARTIAL", (s2After.sale ?? s2After).paymentStatus);
  const ledger = await A.ok("GET", `/api/parties/${cusId}/ledger`);
  check("customer ledger closing = 1486", near(ledger.closingBalance ?? ledger.balance ?? ledger.totals?.balance, 1486), ledger.totals ?? ledger);
  const supLedger = await A.ok("GET", `/api/parties/${supId}/ledger`);
  check("supplier owes us −36219 (payable)", near(supLedger.closingBalance ?? supLedger.balance ?? supLedger.totals?.balance, -36219), supLedger.totals ?? supLedger);

  console.log("\n# adjustments + transfer");
  await A.ok("POST", "/api/inventory/adjustments", { reason: "DAMAGED", items: [{ variantId: riceV, quantity: -1 }] });
  await A.ok("POST", "/api/inventory/adjustments", { reason: "FOUND", items: [{ variantId: teeM, quantity: 1, unitCost: 300 }] });
  const trf = await A.ok("POST", "/api/inventory/transfers", { toLocationId: loc2Id, items: [{ variantId: riceV, quantity: 5 }], dispatch: true });
  const t1 = trf.transfer ?? trf;
  check("transfer in transit", t1.status === "IN_TRANSIT", t1.status);
  await A.ok("POST", `/api/inventory/transfers/${t1.id}/receive`, {});
  const wh = await A.ok("GET", `/api/inventory/stock?locationId=${loc2Id}`);
  check("warehouse has 5 kg rice", near(wh.items.find((s) => s.variantId === riceV)?.quantity, 5), wh.items);
  const all = await A.ok("GET", `/api/inventory/stock?locationId=all&search=Rice`);
  check("all locations rice = 70 − 2.5 − 1 = 66.5", near(all.items.reduce((a, s) => a + (s.variantId === riceV ? Number(s.quantity) : 0), 0), 66.5), all.items);

  console.log("\n# purchase return (credit note)");
  const pd = await A.ok("GET", `/api/purchases/${purchase.id}`);
  const pItem = (pd.purchase ?? pd).items.find((i) => i.variantId === teeM);
  const pr = await A.ok("POST", "/api/purchase-returns", { purchaseId: purchase.id, items: [{ purchaseItemId: pItem.id, variantId: teeM, quantity: 1 }] });
  const prr = pr.purchaseReturn ?? pr;
  await A.ok("POST", `/api/purchase-returns/${prr.id}/complete`, { resolution: "CREDIT_NOTE" });
  check("purchase return 300 + 13%", near(prr.grandTotal, 339), prr.grandTotal);

  console.log("\n# finance entries");
  await A.ok("POST", "/api/finance/entries", { kind: "EXPENSE", amount: 10000, description: "Shop rent" });
  await A.ok("POST", "/api/finance/entries", { kind: "INCOME", amount: 500, description: "Scrap sale" });

  console.log("\n# reports");
  const dash = await A.ok("GET", "/api/dashboard");
  check("dashboard today sales count = 2 (void excluded)", dash.kpis?.today?.sales === 2, dash.kpis?.today);
  check("dashboard trend 30 days", dash.salesTrend?.length === 30, dash.salesTrend?.length);
  check("dashboard receivable 1486", near(dash.kpis?.receivable, 1486), dash.kpis);
  check("dashboard expiring soon ≥ 1", dash.kpis?.expiringSoon >= 1, dash.kpis);
  const sr = await A.ok("GET", "/api/reports/sales?groupBy=product");
  // net revenue: 31450 + 2200 − (500 + 30000) = 3150
  check("sales report net revenue = 3150", near(sr.summary.netRevenue, 3150), sr.summary);
  // cost: 350 + 600 + 20000 + 1200 − (300 restocked tee) = 21850 (damaged phone stays as cost)
  check("sales report cost = 21850", near(sr.summary.cost, 21850), sr.summary);
  for (const g of ["day", "month", "category", "brand", "customer", "user", "location", "paymentMethod"]) {
    const r = await A.get(`/api/reports/sales?groupBy=${g}`);
    check(`sales report groupBy=${g}`, r.status === 200 && Array.isArray(r.json.items), r.json);
  }
  for (const g of ["day", "month", "supplier", "product", "category"]) {
    const r = await A.get(`/api/reports/purchases?groupBy=${g}`);
    check(`purchases report groupBy=${g}`, r.status === 200 && Array.isArray(r.json.items), r.json);
  }
  const pl = await A.ok("GET", "/api/reports/profit-loss?compare=true");
  check("P&L revenue matches sales report", near(pl.revenue.netRevenue, sr.summary.netRevenue), pl.revenue);
  check("P&L COGS matches sales report", near(pl.costOfGoodsSold.cogs, sr.summary.cost), pl.costOfGoodsSold);
  // gross 3150 − 21850 = −18700; − rice damage 140 + found 300 + 500 − 10000 = −28040
  check("P&L net profit = −28040", near(pl.netProfit, -28040), { net: pl.netProfit, adj: pl.stockAdjustments });
  check("P&L has previous period", !!pl.previous);
  for (const g of ["variant", "category", "location"]) {
    const r = await A.get(`/api/reports/inventory-valuation?groupBy=${g}&locationId=all`);
    check(`valuation groupBy=${g}`, r.status === 200 && r.json.summary.costValue > 0, r.json);
  }
  const mv = await A.ok("GET", `/api/reports/stock-movements?variantId=${riceV}&locationId=all`);
  check("movement closing = 66.5", near(mv.items[0]?.closing, 66.5, 0.001), mv.items);
  const tax = await A.ok("GET", "/api/reports/tax?groupBy=rate");
  check("tax report by rate", tax.items.length >= 1, tax);
  const taxM = await A.ok("GET", "/api/reports/tax?groupBy=month");
  check("tax month = tax rate totals (output)", near(taxM.summary.outputTax, tax.summary.outputTax, 0.05), [taxM.summary, tax.summary]);
  const exp = await A.ok("GET", "/api/reports/expiry?days=60&locationId=all");
  check("expiry report finds L-SOON", JSON.stringify(exp.items).includes("L-SOON"), exp.items);
  const tx = await A.ok("GET", "/api/transactions");
  check("transactions feed lists all kinds", ["SALE", "SALE_RETURN", "PURCHASE", "PURCHASE_RETURN", "PAYMENT", "EXPENSE", "INCOME", "ADJUSTMENT", "TRANSFER"].every((t) => tx.items.some((i) => i.type === t)), [...new Set(tx.items.map((i) => i.type))]);
  const txs = await A.ok("GET", "/api/transactions?type=SALE");
  check("transactions type filter", txs.items.every((i) => i.type === "SALE") && txs.items.length === 3, txs.items.length);

  console.log("\n# roles: read-only staff");
  const roles = await A.ok("GET", "/api/roles");
  const roleList = Array.isArray(roles) ? roles : roles.items;
  const viewer = roleList.find((r) => r.name === "Viewer");
  const staff = await A.ok("POST", "/api/staff", { name: "Read Only", email: `viewer-${run}@example.test`, password: "Viewer1234", assignments: [{ locationId: loc1, roleId: viewer.id }], sendWelcomeEmail: false });
  check("staff created", !!(staff.user?.id ?? staff.id), staff);
  const V = client("viewer");
  await V.ok("POST", "/api/auth/login", { email: `viewer-${run}@example.test`, password: "Viewer1234" });
  check("viewer can read sales", (await V.get("/api/sales")).status === 200);
  check("viewer cannot create sale", (await V.post("/api/sales", { items: [{ variantId: teeS, quantity: 1 }], payments: [{ amount: 565 }] })).status === 403);
  check("viewer cannot change settings", (await V.patch("/api/settings", { settings: { taxLabel: "GST" } })).status === 403);
  check("viewer cannot see warehouse", (await V.get(`/api/inventory/stock?locationId=${loc2Id}`)).status === 403);

  console.log("\n# tenant isolation");
  const B = client("B");
  await B.ok("POST", "/api/auth/register", { businessName: "Other Shop", ownerName: "Owner Two", email: `owner2-${run}@example.test`, password: "Passw0rd123" });
  check("tenant B can't read A's sale", (await B.get(`/api/sales/${s1.id}`)).status === 404);
  check("tenant B can't read A's product", (await B.get(`/api/products/${riceP.id}`)).status === 404);
  check("tenant B can't sell A's variant", (await B.post("/api/sales", { items: [{ variantId: teeS, quantity: 1 }], payments: [{ amount: 1000 }] })).status >= 400);
  check("tenant B can't pay A's party", (await B.post("/api/payments", { partyId: cusId, direction: "RECEIVED_FROM_CUSTOMER", amount: 1 })).status >= 400);
  const bProducts = await B.ok("GET", "/api/products");
  check("tenant B sees no products", bProducts.items.length === 0, bProducts.items.length);
  const bDash = await B.ok("GET", "/api/dashboard");
  check("tenant B dashboard empty", bDash.kpis.today.sales === 0 && bDash.kpis.receivable === 0, bDash.kpis);

  console.log("\n# logout");
  await A.ok("POST", "/api/auth/logout");
  check("refresh after logout fails", (await A.post("/api/auth/refresh")).status === 401);
});
