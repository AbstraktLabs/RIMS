import { BASE, check, client, newShop, run, suite } from "./lib.mjs";

// Security, roles, tenant state, concurrency and bad input.
// Optional: E2E_PLATFORM_EMAIL / E2E_PLATFORM_PASSWORD (a local test super admin)
// enables the suspended-shop and expired-trial checks.

suite("Hardening", async () => {
  const { c: A, reg, email } = await newShop("Harden", { defaultTaxRate: 13 });
  const loc = reg.activeLocationId;
  const ul = (await A.ok("GET", "/api/units")).items;
  const pcs = ul.find((u) => u.code === "pcs");
  const kg = ul.find((u) => u.code === "kg");
  const mk = async (name, unitId = pcs.id) => {
    const r = await A.ok("POST", "/api/products", { name, unitId, variants: [{ sellingPrice: 100, costPrice: 50 }] });
    const p = r.product ?? r;
    return { id: p.id, v: p.variants[0].id };
  };
  const last = await mk("Last One");
  const bulk = await mk("Bulk Item");
  const sugar = await mk("Sugar", kg.id);
  const sup = await A.ok("POST", "/api/parties", { name: "Supplier H", partyType: "SUPPLIER" });
  const supId = sup.id ?? sup.party?.id;
  await A.ok("POST", "/api/purchases", {
    partyId: supId,
    items: [
      { variantId: last.v, quantity: 1, unitCost: 50 },
      { variantId: bulk.v, quantity: 100, unitCost: 50 },
      { variantId: sugar.v, quantity: 10, unitCost: 50 },
    ],
    payments: [{ amount: 5550 }],
  });

  console.log("\n# tokens and sessions");
  const anon = client("anon");
  check("no token → 401", (await anon.get("/api/products")).status === 401);
  const tok = A.token();
  const [h, p, sig] = tok.split(".");
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  const forged = Buffer.from(JSON.stringify({ ...claims, isOwner: true, permissions: ["settings.manage"] })).toString("base64url");
  anon.setToken(`${h}.${forged}.${sig}`);
  check("tampered token → 401", (await anon.get("/api/products")).status === 401);
  const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  anon.setToken(`${none}.${p}.`);
  check("alg:none token → 401", (await anon.get("/api/products")).status === 401);
  anon.setToken("garbage");
  check("garbage token → 401", (await anon.get("/api/products")).status === 401);

  const S = client("session");
  await S.ok("POST", "/api/auth/login", { email, password: "Passw0rd123" });
  const stolen = new Map(S.cookies);
  await S.ok("POST", "/api/auth/refresh");
  const thief = client("thief");
  for (const [k, v] of stolen) thief.cookies.set(k, v);
  check("replayed (already rotated) refresh token → 401", (await thief.post("/api/auth/refresh")).status === 401);
  check("replay revokes the whole session", (await S.post("/api/auth/refresh")).status === 401);
  // two tabs refreshing at the same instant with the same cookie
  const T1 = client("tab1");
  await T1.ok("POST", "/api/auth/login", { email, password: "Passw0rd123" });
  const T2 = client("tab2");
  for (const [k, v] of T1.cookies) T2.cookies.set(k, v);
  const both = await Promise.all([T1.post("/api/auth/refresh"), T2.post("/api/auth/refresh")]);
  const winner = both[0].status === 200 ? T1 : T2;
  check("simultaneous refreshes: one wins, the other gets 401", both.map((r) => r.status).sort().join() === "200,401", both.map((r) => r.status));
  check("…and the session survives the race", (await winner.post("/api/auth/refresh")).status === 200);
  const L = client("logout");
  await L.ok("POST", "/api/auth/login", { email, password: "Passw0rd123" });
  const kept = new Map(L.cookies);
  await L.ok("POST", "/api/auth/logout");
  const after = client("after-logout");
  for (const [k, v] of kept) after.cookies.set(k, v);
  check("refresh token unusable after logout", (await after.post("/api/auth/refresh")).status === 401);

  console.log("\n# login throttling");
  const bad = client("brute");
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await bad.post("/api/auth/login", { email, password: `Wrong${i}pass` })).status);
  check("5 wrong passwords → 401, then 429", codes.slice(0, 5).every((s) => s === 401) && codes[5] === 429, codes);
  check("locked out even with the right password", (await bad.post("/api/auth/login", { email, password: "Passw0rd123" })).status === 429);
  check("unknown email gets the same 401 (no account probing)", (await client("probe").post("/api/auth/login", { email: `nobody-${run}@example.test`, password: "Whatever1" })).status === 401);
  // Behind one proxy, X-Forwarded-For is "<whatever the client sent>, <real ip>".
  // Rotating the client-sent part must not escape the per-IP limit.
  const proxyIp = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.7`;
  const spoof = [];
  for (let i = 0; i < 11; i++) {
    spoof.push((await client("spoof").post("/api/platform/login", { email: `x${i}-${run}@example.test`, password: "Nope12345" }, { "x-forwarded-for": `203.0.113.${i}, ${proxyIp}` })).status);
  }
  check("spoofed X-Forwarded-For can't dodge the IP limit", spoof[10] === 429, spoof);

  console.log("\n# roles");
  const roles = (await A.ok("GET", "/api/roles")).items ?? (await A.ok("GET", "/api/roles"));
  const role = (n) => (Array.isArray(roles) ? roles : roles.items).find((r) => r.name === n);
  const mkStaff = async (label, roleName) => {
    const em = `${label}-${run}@example.test`;
    await A.ok("POST", "/api/staff", { name: label, email: em, password: "Staff12345", assignments: [{ locationId: loc, roleId: role(roleName).id }], sendWelcomeEmail: false });
    const s = client(label);
    await s.ok("POST", "/api/auth/login", { email: em, password: "Staff12345" });
    return s;
  };
  const M = await mkStaff("manager", "Manager");
  const V = await mkStaff("viewer", "Viewer");
  check("manager can sell", (await M.post("/api/sales", { items: [{ variantId: bulk.v, quantity: 1 }], payments: [{ amount: 100 }] })).status === 201);
  check("manager can record a purchase", (await M.post("/api/purchases", { partyId: supId, items: [{ variantId: bulk.v, quantity: 1, unitCost: 50 }] })).status === 201);
  check("manager can read reports", (await M.get("/api/reports/profit-loss")).status === 200);
  check("manager cannot change settings", (await M.patch("/api/settings", { settings: { taxLabel: "GST" } })).status === 403);
  check("manager cannot add staff", (await M.post("/api/staff", { name: "Sneaky", email: `sneaky-${run}@example.test`, password: "Staff12345", assignments: [{ locationId: loc, roleId: role("Manager").id }] })).status === 403);
  check("viewer cannot void a sale", (await V.post(`/api/sales/00000000-0000-4000-8000-000000000000/void`, { reason: "x" })).status === 403);
  check("viewer cannot record a payment", (await V.post("/api/payments", { partyId: supId, direction: "PAID_TO_SUPPLIER", amount: 1 })).status === 403);
  check("viewer cannot use reorder suggestions", (await V.get("/api/products/reorder")).status === 403);
  check("viewer can read stock", (await V.get("/api/inventory/stock")).status === 200);
  const manager = (await A.ok("GET", "/api/staff")).items.find((u) => u.email === `manager-${run}@example.test`);
  await A.ok("PATCH", `/api/staff/${manager.id}`, { isActive: false });
  check("deactivated staff can't refresh their session", (await M.post("/api/auth/refresh")).status === 401);
  check("deactivated staff can't sign in", (await client("m2").post("/api/auth/login", { email: `manager-${run}@example.test`, password: "Staff12345" })).status === 401);

  console.log("\n# concurrency");
  const race = await Promise.all(Array.from({ length: 6 }, () => A.post("/api/sales", { items: [{ variantId: last.v, quantity: 1 }], payments: [{ amount: 113 }] })));
  const won = race.filter((r) => r.status === 201).length;
  check("6 tills selling the last unit at once: exactly 1 succeeds", won === 1, race.map((r) => r.status));
  const lastStock = (await A.ok("GET", "/api/inventory/stock?search=Last One")).items[0];
  check("…and stock ends at 0, not negative", Number(lastStock.quantity) === 0, lastStock);
  const burst = await Promise.all(Array.from({ length: 12 }, () => A.post("/api/sales", { items: [{ variantId: bulk.v, quantity: 1 }], payments: [{ amount: 113 }] })));
  const nums = burst.filter((r) => r.status === 201).map((r) => (r.json.sale ?? r.json).invoiceNumber);
  const digits = nums.map((n) => Number(String(n).replace(/\D/g, ""))).sort((a, b) => a - b);
  check("12 parallel sales all succeed", nums.length === 12, burst.map((r) => r.status));
  check("…with unique, gap-free invoice numbers", new Set(nums).size === 12 && digits[11] - digits[0] === 11, nums);
  const bulkStock = (await A.ok("GET", "/api/inventory/stock?search=Bulk Item")).items[0];
  check("stock after the burst is exact (100 + 1 − 1 − 12)", Number(bulkStock.quantity) === 88, bulkStock);

  console.log("\n# bad input");
  check("negative quantity → 400", (await A.post("/api/sales", { items: [{ variantId: bulk.v, quantity: -2 }], payments: [{ amount: 1 }] })).status === 400);
  check("fractional pieces → 400", (await A.post("/api/sales", { items: [{ variantId: bulk.v, quantity: 1.5 }], payments: [{ amount: 200 }] })).status === 400);
  const dec = await A.post("/api/sales", { items: [{ variantId: sugar.v, quantity: 0.25 }], payments: [{ amount: 100 }] });
  check("decimal kilograms allowed", dec.status === 201, dec.json);
  check("amount as text → 400", (await A.post("/api/payments", { partyId: supId, direction: "PAID_TO_SUPPLIER", amount: "lots" })).status === 400);
  check("empty items → 400", (await A.post("/api/sales", { items: [], payments: [{ amount: 1 }] })).status === 400);
  check("absurd page size is rejected or capped", [200, 400].includes((await A.get("/api/products?limit=100000")).status));
  for (const q of ["%", "_", "'; drop table products; --", "\\", "\"", "Ω≈ç√"]) {
    const r = await A.get(`/api/products?search=${encodeURIComponent(q)}`);
    check(`search ${JSON.stringify(q)} is safe`, r.status === 200 && Array.isArray(r.json.items), r.status);
  }
  check("very long name → 400", (await A.post("/api/products", { name: "x".repeat(5000), unitId: pcs.id, variants: [{ sellingPrice: 1 }] })).status === 400);
  check("malformed JSON → 400", (await fetch(`${BASE}/api/products`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${A.token()}` }, body: "{not json" })).status === 400);
  check("transfer to the same location → 400", (await A.post("/api/inventory/transfers", { toLocationId: loc, items: [{ variantId: bulk.v, quantity: 1 }] })).status === 400);
  const injected = await A.post("/api/parties", { name: "Mass Assign", partyType: "CUSTOMER", organizationId: "00000000-0000-4000-8000-000000000000", balance: 999999 });
  const mass = injected.json.party ?? injected.json;
  check("unknown fields are ignored (no mass assignment)", injected.status === 201 && (await A.ok("GET", `/api/parties/${mass.id}`)).party?.name === "Mass Assign", injected.json);

  console.log("\n# document numbering settings");
  await A.ok("PATCH", "/api/settings/sequences", { documentType: "SALE", prefix: `T${run.slice(-3).toUpperCase()}-` });
  const pref = await A.ok("POST", "/api/sales", { items: [{ variantId: bulk.v, quantity: 1 }], payments: [{ amount: 113 }] });
  check("new invoice uses the changed prefix", (pref.sale ?? pref).invoiceNumber.startsWith(`T${run.slice(-3).toUpperCase()}-`), (pref.sale ?? pref).invoiceNumber);

  console.log("\n# cross-business access");
  const { c: B } = await newShop("Other");
  const bParty = await B.ok("POST", "/api/parties", { name: "B customer", partyType: "CUSTOMER" });
  const bPartyId = bParty.id ?? bParty.party?.id;
  check("A can't read B's party", (await A.get(`/api/parties/${bPartyId}`)).status === 404);
  check("A can't read B's ledger", (await A.get(`/api/parties/${bPartyId}/ledger`)).status === 404);
  check("A can't edit B's party", (await A.patch(`/api/parties/${bPartyId}`, { name: "Hijacked" })).status === 404);
  check("A can't pay against B's party", (await A.post("/api/payments", { partyId: bPartyId, direction: "RECEIVED_FROM_CUSTOMER", amount: 10 })).status === 404);
  check("B can't see A's lots", (await B.get(`/api/variants/${bulk.v}/lots`)).status === 404);
  check("B can't see A's serials", (await B.get(`/api/variants/${bulk.v}/serials`)).status === 404);
  check("B can't edit A's product", (await B.put(`/api/products/${bulk.id}`, { name: "Hijacked", unitId: pcs.id, variants: [{ sellingPrice: 1 }] })).status === 404);
  check("A's product unchanged", (await A.ok("GET", `/api/products/${bulk.id}`)).product.name === "Bulk Item");
  check("B's lists don't include A's data", (await B.ok("GET", "/api/products")).items.length === 0);
  check("B's dashboard is empty", (await B.ok("GET", "/api/dashboard")).kpis.today.sales === 0);

  const pe = process.env.E2E_PLATFORM_EMAIL;
  const pp = process.env.E2E_PLATFORM_PASSWORD;
  if (!pe || !pp) {
    console.log("\n# suspended / expired shops — skipped (set E2E_PLATFORM_EMAIL and E2E_PLATFORM_PASSWORD)");
    return;
  }
  console.log("\n# suspended / expired shops");
  const P = client("platform");
  await P.ok("POST", "/api/platform/login", { email: pe, password: pp });
  const orgId = reg.organization.id;
  check("tenant token can't use the platform API", (await A.get("/api/platform/organizations")).status === 401);
  await P.ok("PATCH", `/api/platform/organizations/${orgId}`, { status: "SUSPENDED" });
  const susp = await A.post("/api/sales", { items: [{ variantId: bulk.v, quantity: 1 }], payments: [{ amount: 113 }] });
  check("suspended shop can't write", susp.status === 403 && susp.json?.details?.code === "TENANT_READ_ONLY", susp.json);
  check("suspended shop can still read", (await A.get("/api/sales")).status === 200);
  await P.ok("PATCH", `/api/platform/organizations/${orgId}`, { status: "TRIAL", trialEndsAt: new Date(Date.now() - 86_400_000).toISOString() });
  check("expired trial can't write", (await A.post("/api/parties", { name: "Late", partyType: "CUSTOMER" })).status === 403);
  await P.ok("PATCH", `/api/platform/organizations/${orgId}`, { status: "ACTIVE" });
  check("reactivated shop can write again", (await A.post("/api/parties", { name: "Back", partyType: "CUSTOMER" })).status === 201);
});
