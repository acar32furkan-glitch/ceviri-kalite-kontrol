"use client";

import { FormEvent, useRef, useState } from "react";
import type {
  CategoryScores,
  DirectionChoice,
  EvaluationReport,
  EvaluationIssue,
} from "@/lib/types";
import { parseGlossary } from "@/lib/validation";

type EvaluationStatus = "idle" | "loading" | "success" | "error";

interface ExampleTexts {
  title: string;
  source: string;
  target: string;
  glossary: string;
}

const examples: ExampleTexts[] = [
  {
    title: "Ürün güncellemesi",
    source:
      "Your password has been reset. If you did not request this change, please contact our support team immediately.",
    target:
      "Parolanız sıfırlandı. Bu değişikliği siz talep etmediyseniz lütfen hemen destek ekibimizle iletişime geçin.",
    glossary: "password = parola\nsupport team = destek ekibi",
  },
  {
    title: "Yerelleştirme",
    source:
      "Kullanıcılar panodaki son değişiklikleri görebilir ve bildirim tercihlerini istedikleri zaman güncelleyebilir.",
    target:
      "Users can see the latest changes on the dashboard and update their notification preferences whenever they want.",
    glossary: "dashboard = kontrol paneli\nnotification preferences = bildirim tercihleri",
  },
];

const categories: Array<{ key: keyof CategoryScores; label: string; description: string }> = [
  { key: "accuracy", label: "Anlam doğruluğu", description: "Mesajın eksiksiz ve doğru aktarılması" },
  { key: "fluency", label: "Akıcılık", description: "Doğal, okunabilir ve hedef dile uygun kullanım" },
  { key: "terminology", label: "Terminoloji", description: "Alan dili ve glossary tutarlılığı" },
  { key: "tone", label: "Ton ve register", description: "Bağlama uygun üslup ve hitap düzeyi" },
  { key: "formatting", label: "Biçimlendirme", description: "Sayı, placeholder ve etiketlerin korunması" },
];

const issueTypeLabels: Record<string, string> = {
  omission: "Eksik çeviri",
  addition: "Gereksiz ekleme",
  terminology: "Terminoloji",
  grammar: "Dil bilgisi",
  fluency: "Akıcılık",
  tone: "Ton",
  formatting: "Biçimlendirme",
  meaning: "Anlam",
};

function detectSourceLanguage(text: string): "tr" | "en" | "unknown" {
  const normalized = text.toLocaleLowerCase("tr-TR");
  const turkishMarkers = ["ve", "bir", "için", "ile", "bu", "çok", "çünkü", "ancak", "lütfen"];
  const turkishCharacters = (normalized.match(/[çğıöşüâîû]/g) ?? []).length;
  const markerCount = turkishMarkers.filter((marker) => normalized.includes(` ${marker} `)).length;
  if (turkishCharacters >= 2 || markerCount >= 2) return "tr";
  if (/[a-z]/i.test(text)) return "en";
  return "unknown";
}

function parseClientGlossary(raw: string) {
  const entries = parseGlossary(raw);
  const nonEmptyLines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const malformedCount = nonEmptyLines.length - entries.length;
  return { entries, malformedCount };
}

function scoreTone(score: number): string {
  if (score >= 85) return "Güçlü";
  if (score >= 65) return "İyi";
  if (score >= 45) return "Orta";
  return "İyileştirme gerekli";
}

function severityMeta(severity: EvaluationIssue["severity"]) {
  if (severity === "high") {
    return {
      label: "Yüksek öncelik",
      className: "border-rose-400/40 bg-rose-400/10 text-rose-200",
      dot: "bg-rose-400",
    };
  }
  if (severity === "medium") {
    return {
      label: "Orta öncelik",
      className: "border-amber-300/40 bg-amber-300/10 text-amber-200",
      dot: "bg-amber-300",
    };
  }
  return {
    label: "Düşük öncelik",
    className: "border-sky-300/40 bg-sky-300/10 text-sky-200",
    dot: "bg-sky-300",
  };
}

function ScoreRing({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      <svg className="h-32 w-32 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} className="stroke-white/10" strokeWidth="8" fill="none" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className="stroke-emerald-300 transition-all duration-700 ease-out"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-semibold tracking-tight text-white">{score}</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">/ 100</div>
      </div>
    </div>
  );
}

function CategoryScore({
  label,
  description,
  score,
}: {
  label: string;
  description: string;
  score: number;
}) {
  return (
    <div className="border-b border-white/[0.07] py-4 last:border-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-100">{label}</div>
          <div className="mt-0.5 text-xs text-slate-400">{description}</div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold text-emerald-200">{score}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">/ 100</span>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300 transition-all duration-700 ease-out"
          style={{ width: `${Math.max(score, 3)}%` }}
        />
      </div>
      <div className="mt-1.5 text-[10px] uppercase tracking-[0.14em] text-emerald-200/70">{scoreTone(score)}</div>
    </div>
  );
}

function IssueCard({ issue, index }: { issue: EvaluationIssue; index: number }) {
  const meta = severityMeta(issue.severity);
  return (
    <article className="rounded-xl border bg-white/[0.035] p-4 transition-colors hover:border-white/10 hover:bg-white/[0.055]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>
              {meta.label}
            </span>
          </div>
          <h3 className="mt-3 text-sm font-medium text-slate-100">
            {issueTypeLabels[issue.type.toLowerCase()] ?? issue.type}
          </h3>
        </div>
        <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-mono text-slate-400">
          #{index + 1}
        </span>
      </div>
      {issue.snippet && (
        <blockquote className="mt-3 border-l-2 border-emerald-300/50 pl-3 text-sm italic leading-6 text-slate-300">
          “{issue.snippet}”
        </blockquote>
      )}
      <p className="mt-3 text-sm leading-6 text-slate-400">{issue.suggestion}</p>
    </article>
  );
}

function LoadingReport() {
  return (
    <div className="animate-pulse space-y-5" aria-label="Değerlendirme hazırlanıyor">
      <div className="flex items-center gap-5">
        <div className="h-28 w-28 rounded-full bg-white/[0.07]" />
        <div className="space-y-3">
          <div className="h-4 w-36 rounded bg-white/[0.09]" />
          <div className="h-3 w-52 rounded bg-white/[0.06]" />
          <div className="h-3 w-44 rounded bg-white/[0.06]" />
        </div>
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-16 rounded-xl bg-white/[0.05]" />
        ))}
      </div>
    </div>
  );
}

function EmptyReport() {
  return (
    <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-300/10 text-emerald-200">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M4 5.5h7M4 12h7M4 18.5h7M13 5.5h7M13 12h7M13 18.5h7" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="mt-5 text-base font-medium text-slate-100">Raporunuz burada görünecek</h3>
      <p className="mt-2 max-w-xs text-sm leading-6 text-slate-400">
        Kaynak metni ve çevirisini ekleyin; anlam, akıcılık, terminoloji ve biçimlendirme kontrolünü başlatın.
      </p>
    </div>
  );
}

export default function TranslationQualityApp() {
  const [sourceText, setSourceText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [direction, setDirection] = useState<DirectionChoice>("auto");
  const [glossary, setGlossary] = useState("");
  const [status, setStatus] = useState<EvaluationStatus>("idle");
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [message, setMessage] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<"tr" | "en" | "unknown">("unknown");
  const requestSequence = useRef(0);

  const sourceCount = sourceText.length;
  const targetCount = targetText.length;
  const canSubmit = sourceCount >= 10 && targetCount >= 10 && sourceCount <= 5000 && targetCount <= 5000 && status !== "loading";

  function loadExample(example: ExampleTexts) {
    setSourceText(example.source);
    setTargetText(example.target);
    setGlossary(example.glossary);
    setDirection("auto");
    setStatus("idle");
    setReport(null);
    setMessage("");
    setDetectedLanguage(detectSourceLanguage(example.source));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const source = sourceText.trim();
    const target = targetText.trim();

    if (source.length < 10 || target.length < 10) {
      setStatus("error");
      setMessage("Değerlendirme için her iki metin de en az 10 karakter olmalıdır.");
      return;
    }
    if (source.length > 5000 || target.length > 5000) {
      setStatus("error");
      setMessage("Her metin en fazla 5.000 karakter olabilir. Lütfen metni kısaltarak yeniden deneyin.");
      return;
    }
    if (source === target) {
      setStatus("error");
      setMessage("Bu iki metin aynı görünüyor. Lütfen hedef çeviriyi kontrol edin.");
      return;
    }

    const detected = detectSourceLanguage(source);
    setDetectedLanguage(detected);
    const resolvedDirection = direction === "auto" ? detected === "tr" ? "tr-en" : "en-tr" : direction;
    const { entries, malformedCount } = parseClientGlossary(glossary);
    if (malformedCount > 0) {
      setStatus("error");
      setMessage(`${malformedCount} glossary satırı “kaynak = hedef” biçiminde olmadığı için dikkate alınmadı.`);
      return;
    }

    const sequence = ++requestSequence.current;
    setStatus("loading");
    setMessage("");
    setReport(null);

    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceText: source,
          targetText: target,
          direction: resolvedDirection,
          ...(entries.length > 0 ? { glossary: entries } : {}),
        }),
      });
      const data = (await response.json()) as { report?: EvaluationReport; error?: string };
      if (sequence !== requestSequence.current) return;
      if (!response.ok || !data.report) {
        throw new Error(data.error ?? "Değerlendirme tamamlanamadı.");
      }
      setReport(data.report);
      setStatus("success");
      setMessage("Çeviri kalite kontrolü tamamlandı.");
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Değerlendirme tamamlanamadı.");
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-[#07111f]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-cyan-300 text-[#07111f] shadow-lg shadow-emerald-950/30">
              <span className="text-sm font-bold">ÇK</span>
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-white">Çeviri Kalite Kontrol</div>
              <div className="text-[11px] text-slate-400">Furkan Acar · Portföy projesi</div>
            </div>
          </div>
          <a
            href="https://github.com/acar32glitch"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-2 rounded-full border border-white/10 px-3.5 py-2 text-xs font-medium text-slate-300 transition hover:border-emerald-200/40 hover:text-white sm:flex"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.36-3.9-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.28-1.29-5.28-5.73 0-1.27.45-2.3 1.2-3.12-.12-.3-.52-1.48.11-3.07 0 0 .98-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.18-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.77.11 3.07.75.82 1.2 1.85 1.2 3.12 0 4.45-2.72 5.43-5.3 5.72.42.36.79 1.06.79 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
            </svg>
            GitHub
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <section className="pt-14 pb-10 sm:pt-20 sm:pb-14">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-200/[0.07] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]" />
              AI destekli kalite kontrol
            </div>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-6xl">
              Çevirinizin doğruluğunu <span className="bg-gradient-to-r from-emerald-200 via-cyan-200 to-sky-300 bg-clip-text text-transparent">güvenle ölçün.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
              Kaynak metni ve hedef çeviriyi karşılaştırın; anlam, akıcılık, terminoloji, ton ve biçimlendirme açısından aksiyon alınabilir bir rapor oluşturun.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["01", "Karşılaştır", "İki metni yan yana ekleyin ve dil yönünü seçin."],
              ["02", "Analiz et", "AI; kategori bazlı skorlar ve sorunlar üretir."],
              ["03", "İyileştir", "Önerilerle çeviriyi hızla gözden geçirin."],
            ].map(([number, title, description]) => (
              <div key={number} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5">
                <div className="text-xs font-mono uppercase tracking-[0.2em] text-emerald-300">{number}</div>
                <div className="mt-3 text-sm font-medium text-slate-100">{title}</div>
                <div className="mt-1.5 text-sm leading-6 text-slate-400">{description}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="rounded-3xl border border-white/[0.1] bg-[#0b1a2d]/85 p-4 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-6">
              <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-white">Metin karşılaştırma</h2>
                  <p className="mt-1 text-sm text-slate-400">EN ↔ TR çevirilerinizi 5.000 karaktere kadar değerlendirin.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {examples.map((example) => (
                    <button
                      key={example.title}
                      type="button"
                      onClick={() => loadExample(example)}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 transition hover:border-emerald-200/40 hover:text-white"
                    >
                      {example.title}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-[0.12em] text-slate-300">
                    <span>Kaynak metin</span>
                    <span className={`normal-case tracking-normal ${sourceCount > 5000 ? "text-rose-300" : "text-slate-500"}`}>{sourceCount} / 5.000</span>
                  </span>
                  <textarea
                    value={sourceText}
                    onChange={(event) => setSourceText(event.target.value)}
                    placeholder="Örneğin: Your account is ready to use..."
                    rows={11}
                    maxLength={5000}
                    className="min-h-[190px] w-full resize-y rounded-xl border border-white/10 bg-[#07111f]/70 p-4 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/10"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-[0.12em] text-slate-300">
                    <span>Hedef çeviri</span>
                    <span className={`normal-case tracking-normal ${targetCount > 5000 ? "text-rose-300" : "text-slate-500"}`}>{targetCount} / 5.000</span>
                  </span>
                  <textarea
                    value={targetText}
                    onChange={(event) => setTargetText(event.target.value)}
                    placeholder="Örneğin: Hesabınız kullanıma hazır..."
                    rows={11}
                    maxLength={5000}
                    className="min-h-[190px] w-full resize-y rounded-xl border border-white/10 bg-[#07111f]/70 p-4 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/10"
                  />
                </label>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-slate-300">Dil yönü</span>
                  <div className="grid grid-cols-3 rounded-xl border border-white/10 bg-[#07111f]/70 p-1">
                    {([
                      ["auto", "Otomatik"],
                      ["en-tr", "EN → TR"],
                      ["tr-en", "TR → EN"],
                    ] as Array<[DirectionChoice, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setDirection(value)}
                        className={`rounded-lg px-2 py-2 text-xs transition ${direction === value ? "bg-emerald-300/15 font-medium text-emerald-200 shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
                        aria-pressed={direction === value}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Algılanan kaynak dil:{" "}
                    <span className="font-medium text-slate-300">
                      {detectedLanguage === "unknown" ? "henüz algılanmadı" : detectedLanguage.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-slate-300">
                    Glossary <span className="normal-case font-normal tracking-normal text-slate-500">(opsiyonel)</span>
                  </span>
                  <textarea
                    value={glossary}
                    onChange={(event) => setGlossary(event.target.value)}
                    placeholder="password = parola&#10;support team = destek ekibi"
                    rows={5}
                    className="min-h-[104px] w-full resize-y rounded-xl border border-white/10 bg-[#07111f]/70 p-3.5 text-sm leading-5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/10"
                  />
                  <div className="mt-2 text-[11px] leading-4 text-slate-500">Her satıra bir terim yazın. En fazla 20 satır.</div>
                </div>
              </div>

              {message && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`mt-5 rounded-xl border px-4 py-3 text-sm leading-5 ${status === "error" ? "border-rose-300/25 bg-rose-300/[0.08] text-rose-200" : "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-200"}`}
                >
                  {message}
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs leading-5 text-slate-500">
                  Verileriniz yalnızca değerlendirme isteği için işlenir. API anahtarı sunucu tarafında tutulur.
                </div>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-5 text-sm font-semibold text-[#07111f] transition hover:from-emerald-200 hover:to-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {status === "loading" ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" className="opacity-25" stroke="currentColor" strokeWidth="3" />
                        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Değerlendiriliyor
                    </>
                  ) : (
                    <>
                      Değerlendir
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="m5 12 14 0M13 6 19 12l-6 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          <aside className="lg:sticky lg:top-6">
            <div className="rounded-3xl border border-white/[0.1] bg-[#0b1a2d]/85 p-5 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-white">Kalite raporu</h2>
                  <p className="mt-1 text-sm text-slate-400">Kategori bazlı içgörü ve düzeltme önerileri</p>
                </div>
                {status === "success" && (
                  <span className="rounded-full bg-emerald-300/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-200">Tamamlandı</span>
                )}
              </div>

              {status === "loading" && <LoadingReport />}
              {status !== "loading" && !report && <EmptyReport />}
              {status !== "loading" && report && (
                <div className="space-y-6">
                  <div className="flex items-center gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5">
                    <ScoreRing score={report.overallScore} />
                    <div>
                      <div className="text-sm font-medium text-slate-100">Genel kalite puanı</div>
                      <div className="mt-1.5 text-xs leading-5 text-slate-400">{scoreTone(report.overallScore)} çeviri kalitesi</div>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-400">5 kategori</span>
                        <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-slate-400">{report.issues.length} sorun</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Kategori skorları</div>
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4">
                      {categories.map((category) => (
                        <CategoryScore
                          key={category.key}
                          label={category.label}
                          description={category.description}
                          score={report.categoryScores[category.key]}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Dikkat edilmesi gerekenler</div>
                      <span className="text-[10px] text-slate-500">Önceliğe göre sıralı</span>
                    </div>
                    <div className="space-y-3">
                      {report.issues.length > 0 ? (
                        report.issues.map((issue, index) => <IssueCard key={`${issue.snippet}-${index}`} issue={issue} index={index} />)
                      ) : (
                        <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4 text-sm leading-6 text-emerald-100">
                          Öne çıkan bir sorun bulunamadı. Çeviriyi son bir okumayla yayına hazırlayabilirsiniz.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </section>

        <section className="mt-16 grid gap-5 border-t border-white/[0.08] pt-10 sm:grid-cols-3">
          {[
            ["Güvenli sunucu mimarisi", "API anahtarı yalnızca backend route üzerinden kullanılır; kullanıcı girdisi sunucuda doğrulanır."],
            ["Portföy odaklı kalite", "Strict TypeScript, test edilebilir modüller ve anlaşılır hata akışlarıyla üretilebilir bir temel."],
            ["İnsan odaklı rapor", "Ham model çıktısı yerine karar verilebilir skorlar, öncelikler ve uygulanabilir öneriler."],
          ].map(([title, description]) => (
            <div key={title} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="h-1 w-8 rounded-full bg-emerald-300/70" />
              <h3 className="mt-4 text-sm font-medium text-slate-100">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-white/[0.08]">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-5 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-8">
          <span>© 2026 Furkan Acar</span>
          <span>Çeviri ve yerelleştirme ekipleri için tasarlandı.</span>
        </div>
      </footer>
    </div>
  );
}
