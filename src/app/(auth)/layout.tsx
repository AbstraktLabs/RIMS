import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#044d73] text-base font-bold text-white">R</div>
        <span className="text-base font-bold text-slate-900">Retail IMS</span>
      </Link>
      {children}
    </div>
  );
}
