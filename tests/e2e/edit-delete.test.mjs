import { check, near, newShop, suite } from "./lib.mjs";

// Sales and purchases can be edited and deleted like in the pharmacy IMS.
// Edit keeps the document number; delete voids it behind the scenes so stock,
// party balances and payments all reverse, and it drops out of the lists.

suite("Edit and delete", async () => {
  const { c: A } = await newShop("EditDel");
  const pcs = (await A.ok("GET", "/api/units")).items.find((u) => u.code === "pcs");
  const product = async (name, price) =>
    (await A.ok("POST", "/api/products", { name, unitId: pcs.id, variants: [{ sellingPrice: price }] })).product.variants[0].id;
  const soap = await product("Soap", 50);
  const oil = await product("Oil", 200);
  const sup = (await A.ok("POST", "/api/parties", { name: "Supplier", partyType: "SUPPLIER" })).party.id;
  const cus = (await A.ok("POST", "/api/parties", { name: "Customer", partyType: "CUSTOMER" })).party.id;
  const stockOf = async (v) => (await A.ok("GET", "/api/inventory/stock")).items.find((s) => s.variantId === v)?.quantity ?? 0;
  const balanceOf = async (id) => (await A.ok("GET", `/api/parties/${id}`)).party.balance;

  console.log("\n# purchase edit");
  const pur = (await A.ok("POST", "/api/purchases", { partyId: sup, items: [{ variantId: soap, quantity: 10, unitCost: 30 }], payments: [{ amount: 100, method: "CASH" }] })).purchase;
  check("purchase adds 10 soap", near(await stockOf(soap), 10));
  const edited = (await A.ok("PUT", `/api/purchases/${pur.id}`, {
    partyId: sup,
    items: [{ variantId: soap, quantity: 12, unitCost: 30 }, { variantId: oil, quantity: 5, unitCost: 150 }],
    payments: [{ amount: 300, method: "CASH" }],
  })).purchase;
  check("edit keeps the purchase number", edited.number === pur.number, [edited.number, pur.number]);
  check("edit replaces the lines", edited.items.length === 2);
  check("stock follows the edit (soap 12, oil 5)", near(await stockOf(soap), 12) && near(await stockOf(oil), 5));
  check("total and payment follow the edit", near(edited.grandTotal, 1110) && near(edited.paidAmount, 300));
  check("supplier balance follows the edit", near(await balanceOf(sup), -810), await balanceOf(sup));

  console.log("\n# sale edit");
  const sale = (await A.ok("POST", "/api/sales", { channel: "INVOICE", partyId: cus, items: [{ variantId: soap, quantity: 2 }] })).sale;
  check("sale takes 2 soap", near(await stockOf(soap), 10));
  const saleEd = (await A.ok("PUT", `/api/sales/${sale.id}`, {
    channel: "INVOICE",
    partyId: cus,
    items: [{ variantId: soap, quantity: 4 }, { variantId: oil, quantity: 1 }],
    payments: [{ amount: 100, method: "CASH" }],
  })).sale;
  check("edit keeps the invoice number", saleEd.invoiceNumber === sale.invoiceNumber);
  check("stock follows the sale edit (soap 8, oil 4)", near(await stockOf(soap), 8) && near(await stockOf(oil), 4));
  check("sale total 400, paid 100", near(saleEd.grandTotal, 400) && near(saleEd.paidAmount, 100));
  check("customer owes 300", near(await balanceOf(cus), 300), await balanceOf(cus));
  check("can't edit a purchase whose goods were sold below the bought quantity", (await A.put(`/api/purchases/${pur.id}`, {
    partyId: sup,
    items: [{ variantId: soap, quantity: 1, unitCost: 30 }],
  })).status === 409);

  console.log("\n# delete");
  check("delete sale", (await A.del(`/api/sales/${sale.id}`)).status === 200);
  check("stock returns after sale delete", near(await stockOf(soap), 12) && near(await stockOf(oil), 5));
  check("customer balance back to 0", near(await balanceOf(cus), 0));
  const posted = (await A.ok("GET", "/api/sales?status=POSTED")).items;
  check("deleted sale hidden from the posted list", !posted.some((s) => s.id === sale.id));
  check("deleted sale can't be edited", (await A.put(`/api/sales/${sale.id}`, { channel: "INVOICE", items: [{ variantId: soap, quantity: 1 }], payments: [{ amount: 50, method: "CASH" }] })).status === 409);
  check("delete purchase", (await A.del(`/api/purchases/${pur.id}`)).status === 200);
  check("stock back to 0", near(await stockOf(soap), 0) && near(await stockOf(oil), 0));
  check("supplier balance back to 0", near(await balanceOf(sup), 0));
});
