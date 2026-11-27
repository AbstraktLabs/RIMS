import { writeFileSync } from "node:fs";
import { newShop } from "./lib.mjs";

// Creates a demo retail shop (two stores, items with sizes, purchases, sales)
// for clicking through the UI on a local dev server. Writes the sign-in to the
// path given as the first argument (default: ./demo-login.json).

const out = process.argv[2] ?? "demo-login.json";
const { c, email, password, reg } = await newShop("Demo Retail");
const slug = reg.organization?.slug ?? (await c.ok("GET", "/api/auth/me")).organization.slug;

const pcs = (await c.ok("GET", "/api/units")).items.find((u) => u.code === "pcs");
const cat = async (name) => (await c.ok("POST", "/api/categories", { name: `${name}` })).category.id;
const brand = async (name) => (await c.ok("POST", "/api/brands", { name })).brand.id;
const clothing = await cat("Clothing");
const grocery = await cat("Grocery");
const nike = await brand("Nike");
const wai = await brand("Wai Wai");

const tshirt = (
  await c.ok("POST", "/api/products", {
    name: "Cotton T-Shirt",
    unitId: pcs.id,
    categoryId: clothing,
    brandId: nike,
    lowStockThreshold: 5,
    variantOptions: [{ name: "Size", values: ["S", "M", "L"] }],
    variants: ["S", "M", "L"].map((s) => ({ optionValues: { Size: s }, sellingPrice: 900, mrp: 1000 })),
  })
).product;
const noodles = (
  await c.ok("POST", "/api/products", {
    name: "Instant Noodles",
    unitId: pcs.id,
    categoryId: grocery,
    brandId: wai,
    lowStockThreshold: 20,
    trackExpiry: true,
    variants: [{ sellingPrice: 25, mrp: 25 }],
  })
).product;

const sup = (await c.ok("POST", "/api/parties", { name: "Kathmandu Traders", partyType: "SUPPLIER", phone: "9800000001" })).party.id;
const cus = (await c.ok("POST", "/api/parties", { name: "Ram Shrestha", partyType: "CUSTOMER", phone: "9800000002" })).party.id;

const soon = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
const later = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
await c.ok("POST", "/api/purchases", {
  partyId: sup,
  supplierInvoiceNumber: "KT-101",
  items: [
    ...tshirt.variants.map((v) => ({ variantId: v.id, quantity: 10, unitCost: 500, lotNumber: "TS-01" })),
    { variantId: noodles.variants[0].id, quantity: 100, unitCost: 18, lotNumber: "WW-2611", expiryDate: soon },
    { variantId: noodles.variants[0].id, quantity: 50, unitCost: 19, lotNumber: "WW-2705", expiryDate: later },
  ],
  payments: [{ amount: 10000, method: "CASH" }],
});
await c.ok("POST", "/api/sales", {
  channel: "INVOICE",
  partyId: cus,
  items: [
    { variantId: tshirt.variants[1].id, quantity: 2 },
    { variantId: noodles.variants[0].id, quantity: 12 },
  ],
  payments: [{ amount: 1000, method: "CASH" }],
});
await c.ok("POST", "/api/locations", { name: "Lalitpur Branch" });

writeFileSync(out, JSON.stringify({ slug, email, password }, null, 2));
console.log("demo shop ready:", slug);
