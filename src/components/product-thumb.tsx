export function ProductThumb({ url, name, size = "md" }: { url: string | null; name: string; size?: "md" | "lg" }) {
  return (
    <div className={`flex ${size === "lg" ? "h-24 w-24" : "h-10 w-10"} shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-sm font-bold text-slate-400">{name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

