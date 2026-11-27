import Link from "next/link";
import { ArrowRight, Barcode, Boxes, LineChart, Receipt, ShieldCheck, Store } from "lucide-react";

const FEATURES = [
  { icon: Store, title: "Sales invoices", text: "Sell from the batch you pick, cash or credit, with printable tax invoices." },
  { icon: Boxes, title: "Inventory & batches", text: "Sizes and colours, batches with expiry, supplier returns and write-offs." },
  { icon: Receipt, title: "Purchases", text: "Supplier bills that add stock straight to a batch, with part payments." },
  { icon: LineChart, title: "Real profit", text: "Revenue, cost of goods, expenses and net profit by month or year." },
  { icon: Barcode, title: "Multiple locations", text: "Each shop keeps its own stock, with transfers between them." },
  { icon: ShieldCheck, title: "Roles", text: "Owner, manager and read-only accounts, per location." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#044d73] text-sm font-bold text-white">R</div>
          <span className="text-sm font-bold text-slate-900">Retail IMS</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            Sign in
          </Link>
          <Link href="/register" className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">
            Start free trial
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-20">
        <section className="py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Run your shop’s stock, sales and accounts in one place
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-500">
            Built for groceries, fashion, electronics, cosmetics and every kind of retail — from one counter to many branches.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-full bg-[#044d73] px-6 text-sm font-semibold text-white hover:bg-[#033a57]">
              Create your store <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="inline-flex h-12 items-center rounded-full border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Sign in
            </Link>
          </div>
        </section>
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#044d73]/10 text-[#044d73]">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{f.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
