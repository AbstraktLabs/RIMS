export function AuthCard({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`w-full ${wide ? "max-w-xl" : "max-w-sm"}`}>
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-black">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-lg shadow-slate-200/50 sm:p-8">{children}</div>
    </div>
  );
}

export function PrimarySubmit({ loading, children }: { loading?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="mt-2 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-zinc-900 px-8 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}
