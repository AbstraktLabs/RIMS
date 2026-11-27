import { check, near, newShop, suite } from "./lib.mjs";

// The pharmacy-style Purchase and Sales screens: bills with batches, payment
// type (cash = paid, credit = unpaid), the status dropdown and part-payments,
// sizes as separate pickable items, edit and delete.

suite("Purchase and sales vouchers", async () => {
  const { c: A } = await newShop("Vouchers");
  const pcs = (await A.ok("GET", "/api/units")).items.find((u) => u.code === "pcs");
  const shirt = (
    await A.ok("POST", "/api/products", {
      name: "Shirt",
      unitId: pcs.id,
      variantOptions: [{ name: "Size", values: ["S", "M"] }],
      variants: ["S", "M"].map((s) => ({ optionValues: { Size: s }, sellingPrice: 900 })),
    })
  ).product;
  const [small, medium] = shirt.variants.map((v) => v.id);
  const sup = (await A.ok("POST", "/api/parties", { name: "Supplier", partyType: "SUPPLIER" })).party.id;
  const cus = (await A.ok("POST", "/api/parties", { name: "Customer", partyType: "CUSTOMER" })).party.id;
  const balanceOf = async (id) => (await A.ok("GET", `/api/parties/${id}`)).party.balance;

  console.log("\n# item picker");
  const picker = (await A.ok("GET", "/api/inventory/variants")).products;
  check("each size is its own item", picker.some((p) => p.id === small && p.name === "Shirt (S)") && picker.some((p) => p.name === "Shirt (M)"));

  console.log("\n# purchase");
  const line = (variant, qty, rate, batch, extra = {}) => ({ productId: variant, purchaseRate: rate, vatApplicable: true, batch: { batchNumber: batch, quantity: qty, ...extra } });
  const cash = (
    await A.ok("POST", "/api/purchase-vouchers", {
      partyId: sup,
      supplierInvoiceNumber: "S-1",
      purcType: "VAT_EXEMPT",
      paymentType: "CASH",
      discount: 100,
      freightCharges: 50,
      items: [line(small, 10, 500, "B1", { salePrice: 950, mrp: 1000, note: "first lot" }), line(medium, 5, 500, "B2")],
    })
  ).purchase;
  check("cash purchase is paid", cash.paymentStatus === "PAID" && near(cash.grandTotal, 7450), [cash.paymentStatus, cash.grandTotal]);
  check("batch, note and prices are kept", cash.items[0].batchNumber === "B1" && cash.items[0].batch.note === "first lot" && near(cash.items[0].batch.salePrice, 950) && near(cash.items[0].mrp, 1000), cash.items);
  check("stock arrives per size", (await A.ok("GET", "/api/inventory/variants")).products.find((p) => p.id === small).stockQuantity === 10);

  const credit = (
    await A.ok("POST", "/api/purchase-vouchers", {
      partyId: sup,
      purcType: "VAT_ITEM_WISE",
      vatRate: 13,
      paymentType: "CREDIT",
      items: [line(medium, 10, 100, "B3"), { ...line(small, 10, 100, "B4"), vatApplicable: false }],
    })
  ).purchase;
  check("credit purchase is unpaid with VAT on taxed lines only", credit.paymentStatus === "UNPAID" && near(credit.vatAmount, 130) && near(credit.grandTotal, 2130), [credit.paymentStatus, credit.vatAmount, credit.grandTotal]);
  check("supplier is owed the credit bill", near(await balanceOf(sup), -2130), await balanceOf(sup));

  const part = (await A.ok("PATCH", `/api/purchase-vouchers/${credit.id}/status`, { paymentStatus: "PARTIAL", amount: 1000, method: "BANK_TRANSFER" })).purchase;
  check("part payment recorded", part.paymentStatus === "PARTIAL" && part.payments.length === 1 && part.payments[0].method === "BANK_TRANSFER");
  const paid = (await A.ok("PATCH", `/api/purchase-vouchers/${credit.id}/status`, { paymentStatus: "PAID" })).purchase;
  check("marking paid settles the balance", paid.paymentStatus === "PAID" && near(await balanceOf(sup), 0), await balanceOf(sup));
  const unpaid = (await A.ok("PATCH", `/api/purchase-vouchers/${credit.id}/status`, { paymentStatus: "UNPAID" })).purchase;
  check("marking unpaid clears payments", unpaid.paymentStatus === "UNPAID" && unpaid.payments.length === 0);
  await A.ok("PATCH", `/api/purchase-vouchers/${credit.id}/status`, { paymentStatus: "PARTIAL", amount: 500 });

  const edited = (
    await A.ok("PATCH", `/api/purchase-vouchers/${credit.id}`, {
      partyId: sup,
      purcType: "VAT_EXEMPT",
      paymentType: "CREDIT",
      items: [line(medium, 8, 100, "B3")],
    })
  ).purchase;
  check("edit keeps part payments on a credit bill", near(edited.grandTotal, 800) && edited.paymentStatus === "PARTIAL" && near(edited.paidAmount, 500), [edited.grandTotal, edited.paymentStatus, edited.paidAmount]);
  const list = (await A.ok("GET", "/api/purchase-vouchers?page=1&limit=100")).purchases;
  check("list shows both bills", list.length === 2 && list[0].id === credit.id);

  console.log("\n# sale");
  const batches = (await A.ok("GET", `/api/inventory/variants/${small}/batches`)).batches;
  check("batch picker lists the small shirt's batch", batches.length === 1 && batches.every((b) => b.quantityAvailable > 0), batches);
  const b1 = batches.find((b) => b.batchNumber === "B1");
  const walkIn = (
    await A.ok("POST", "/api/sale-vouchers", {
      paymentType: "CASH",
      items: [{ productId: small, batchId: b1.id, quantity: 3, salePrice: 950 }],
    })
  ).sale;
  check("walk-in cash sale is paid", walkIn.paymentStatus === "PAID" && near(walkIn.grandTotal, 2850) && walkIn.party === null);
  check("sold from the chosen batch", walkIn.items[0].batchId === b1.id && walkIn.items[0].batch.batchNumber === "B1");
  const after = (await A.ok("GET", `/api/inventory/variants/${small}/batches`)).batches.find((b) => b.id === b1.id);
  check("batch stock goes down", near(after.quantityAvailable, 7));
  const withSale = (await A.ok("GET", `/api/inventory/variants/${small}/batches?saleId=${walkIn.id}`)).batches.find((b) => b.id === b1.id);
  check("editing a sale counts its own quantity as available", near(withSale.quantityAvailable, 10));

  const noCus = await A.post("/api/sale-vouchers", { paymentType: "CREDIT", items: [{ productId: small, batchId: b1.id, quantity: 1, salePrice: 950 }] });
  check("credit needs a customer", noCus.status === 400, noCus.json);

  const onCredit = (
    await A.ok("POST", "/api/sale-vouchers", {
      partyId: cus,
      paymentType: "CREDIT",
      vatRate: 13,
      prescriptionNote: "deliver Friday",
      items: [{ productId: small, batchId: b1.id, quantity: 2, salePrice: 1000, vatApplicable: true }],
    })
  ).sale;
  check("credit sale with VAT is unpaid", onCredit.paymentStatus === "UNPAID" && near(onCredit.grandTotal, 2260) && onCredit.prescriptionNote === "deliver Friday", [onCredit.paymentStatus, onCredit.grandTotal]);
  check("customer owes the invoice", near(await balanceOf(cus), 2260));
  const recv = (await A.ok("PATCH", `/api/sale-vouchers/${onCredit.id}/status`, { paymentStatus: "PARTIAL", amount: 260, method: "MOBILE_PAYMENT" })).sale;
  check("part receipt recorded", recv.paymentStatus === "PARTIAL" && recv.payments[0].method === "MOBILE_PAYMENT" && near(await balanceOf(cus), 2000));
  const st = await A.ok("GET", `/api/parties/${cus}/statement`);
  check(
    "party ledger statement shows the sale and the receipt",
    st.entries.some((e) => e.type === "Sale" && near(e.debit, 2260)) &&
      st.entries.some((e) => e.type === "Rcpt" && near(e.credit, 260)) &&
      near(st.summary.closingBalance, 2000) &&
      st.summary.closingBalanceType === "Debit Balance" &&
      typeof st.entries[0].nepaliDate === "string" && st.entries[0].nepaliDate.length > 0,
    st,
  );

  const saleEd = (
    await A.ok("PATCH", `/api/sale-vouchers/${walkIn.id}`, {
      paymentType: "CASH",
      items: [{ productId: small, batchId: b1.id, quantity: 5, salePrice: 950 }],
    })
  ).sale;
  check("sale edit keeps the invoice number", saleEd.invoiceNumber === walkIn.invoiceNumber && near(saleEd.grandTotal, 4750));
  const stats = (await A.ok("GET", "/api/sale-vouchers/stats")).stats;
  check("stats split cash and credit", stats.totalCount === 2 && stats.cashCount === 1 && stats.creditCount === 1 && near(stats.totalRevenue, 7010), stats);

  console.log("\n# delete");
  await A.ok("DELETE", `/api/sale-vouchers/${walkIn.id}`);
  const back = (await A.ok("GET", `/api/inventory/variants/${small}/batches`)).batches.find((b) => b.id === b1.id);
  check("deleting a sale puts stock back", near(back.quantityAvailable, 8), back);
  check("deleted sale leaves the list", (await A.ok("GET", "/api/sale-vouchers?page=1&limit=10")).sales.length === 1);
  const blocked = await A.del(`/api/purchase-vouchers/${cash.id}`);
  check("can't delete a bill whose goods were sold", blocked.status === 409, blocked.json);
  await A.ok("DELETE", `/api/sale-vouchers/${onCredit.id}`);
  await A.ok("DELETE", `/api/purchase-vouchers/${cash.id}`);
  check("bill deletes once its goods are back", (await A.ok("GET", "/api/purchase-vouchers?page=1&limit=10")).purchases.length === 1);
});
