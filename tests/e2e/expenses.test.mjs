import { check, near, newShop, suite } from "./lib.mjs";

// The pharmacy-style Expense screen: categories created on first use, add,
// edit, delete, category and date filters.

suite("Expenses", async () => {
  const { c: A } = await newShop("Expenses");
  const rent = (await A.ok("POST", "/api/expenses/category", { name: "Rent" })).expenseCategory;
  const again = (await A.ok("POST", "/api/expenses/category", { name: "rent" })).expenseCategory;
  check("category names are reused, ignoring case", again.id === rent.id);
  check("categories list", (await A.ok("GET", "/api/expenses/category")).expenseCategories.some((c) => c.id === rent.id));

  const e1 = (await A.ok("POST", "/api/expenses", { description: "Shop rent", categoryId: rent.id, amount: 15000, expenseDate: "2026-11-01" })).expense;
  check("expense saved with its category", near(e1.amount, 15000) && e1.category?.name === "Rent" && e1.expenseDate === "2026-11-01", e1);
  await A.ok("POST", "/api/expenses", { description: "Tea", amount: 200, expenseDate: "2026-11-20", note: "staff" });

  const all = await A.ok("GET", "/api/expenses?page=1&limit=8");
  check("list is newest first with pagination", all.expenses.length === 2 && all.expenses[0].description === "Tea" && all.pagination.total === 2, all);
  const byCat = await A.ok("GET", `/api/expenses?categoryId=${rent.id}`);
  check("category filter", byCat.expenses.length === 1 && byCat.expenses[0].id === e1.id);
  const byDate = await A.ok("GET", "/api/expenses?startDate=2026-11-15&endDate=2026-11-30");
  check("date filter", byDate.expenses.length === 1 && byDate.expenses[0].description === "Tea");

  const ed = (await A.ok("PATCH", `/api/expenses/${e1.id}`, { description: "Shop rent Nov", categoryId: rent.id, amount: 16000, expenseDate: "2026-11-02" })).expense;
  check("edit", near(ed.amount, 16000) && ed.description === "Shop rent Nov");

  const inUse = await A.del(`/api/expenses/category/${rent.id}`);
  check("a category in use can't be deleted", inUse.status === 409, inUse.json);
  await A.ok("DELETE", `/api/expenses/${e1.id}`);
  await A.ok("DELETE", `/api/expenses/category/${rent.id}`);
  check("delete", (await A.ok("GET", "/api/expenses")).expenses.length === 1);
});
