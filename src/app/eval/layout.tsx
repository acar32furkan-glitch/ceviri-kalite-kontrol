import Link from "next/link";

/**
 * `/eval/*` alt ağacı için ince bir kabuk.
 * Ana sayfa (`src/app/page.tsx`) başka birinin alanı olduğu için buraya dokunulmaz; eval
 * bölümünün gezinmesi kendi layout'unda tanımlanır.
 */
export default function EvalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-[#07111f]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-cyan-300 text-[#07111f] shadow-lg shadow-emerald-950/30">
              <span className="text-sm font-bold">ÇK</span>
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-white">Çeviri Kalite Kontrol</div>
              <div className="text-[11px] text-slate-400">Furkan Acar · Ölçüm katmanı (Faz 1)</div>
            </div>
          </div>
          <nav aria-label="Eval bölümü" className="flex items-center gap-2 text-xs">
            <Link
              href="/"
              className="rounded-full border border-white/10 px-3.5 py-2 font-medium text-slate-300 transition hover:border-emerald-200/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50"
            >
              Araca dön
            </Link>
            <span
              aria-current="page"
              className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3.5 py-2 font-medium text-emerald-200"
            >
              Kör etiketleme
            </span>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
